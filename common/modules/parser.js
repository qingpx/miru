import Metadata from 'matroska-metadata'
import { arr2hex, hex2bin } from 'uint8-util'
import { fontRx } from './util.js'
import { SUPPORTS } from '@/modules/support.js'

export default class Parser {
  parsed = false
  /** @type {Metadata} */
  metadata = null
  client = null
  file = null
  destroyed = false
  constructor (client, file) {
    this.client = client
    this.file = file
    this.metadata = new Metadata(file)

    this.metadata.getTracks().then(tracks => {
      if (this.destroyed) return
      if (!tracks.length) {
        this.parsed = true
        this.destroy()
      } else {
        this.client.dispatch('tracks', tracks)
      }
    })

    this.metadata.getChapters().then(chapters => {
      if (this.destroyed) return
      this.client.dispatch('chapters', chapters)
    })

    this.metadata.getAttachments().then(files => {
      if (this.destroyed) return
      for (const file of files) {
        if (fontRx.test(file.filename) || file.mimetype?.toLowerCase().includes('font')) {
          // this is cursed, but required, as capacitor-node's IPC hangs for 2mins when runnig on 32bit android when sending uint8's
          const data = hex2bin(arr2hex(file.data))
          // IPC crashes if the message is >16MB, wild
          if (SUPPORTS.isAndroid && data.length > 15_000_000) continue
          this.client.dispatch('file', data)
        }
      }
    })

    this.metadata.on('subtitle', (subtitle, trackNumber) => {
      if (this.destroyed) return
      this.client.dispatch('subtitle', { subtitle, trackNumber })
    })

    if (this.file.name.endsWith('.mkv') || this.file.name.endsWith('.webm')) {
      this.file.on('iterator', ({ iterator }, cb) => {
        if (this.destroyed) return cb(iterator)
        cb(this.metadata.parseStream(iterator))
      })
    }
  }

  async parseSubtitles () {
    if (this.file.name.endsWith('.mkv') || this.file.name.endsWith('.webm')) {
      console.log('Sub parsing started')
      await this.metadata.parseFile()
      console.log('Sub parsing finished')
    }
  }

  destroy () {
    this.destroyed = true
    this.metadata?.destroy()
    this.metadata = undefined
  }
}
