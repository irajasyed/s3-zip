const s3Files = require('s3-files')
const archiver = require('archiver')

const s3Zip = {}
module.exports = s3Zip

s3Zip.archive = function (opts, folder, filesS3, filesZip) {
  const self = this
  let connectionConfig

  this.folder = folder

  self.debug = opts.debug || false

  self.aliasConfig = opts.aliasConfig || null

  if ('s3' in opts) {
    connectionConfig = {
      s3: opts.s3
    }
  } else {
    connectionConfig = {
      region: opts.region
    }
  }

  connectionConfig.bucket = opts.bucket

  self.client = s3Files.connect(connectionConfig)

  const keyStream = self.client.createKeyStream(folder, filesS3)

  const preserveFolderStructure = opts.preserveFolderStructure === true || filesZip
  const fileStream = s3Files.createFileStream(keyStream, preserveFolderStructure)
  const archive = self.archiveStream(fileStream, filesS3, filesZip)

  return archive
}

s3Zip.archiveStream = function (stream, filesS3, filesZip) {
  const self = this
  const folder = this.folder || ''
  const archive = archiver(this.format || 'zip', this.archiverOpts || {})
  archive.on('error', function (err) {
    self.debug && console.log('archive error', err)
  })
  stream
    .on('data', function (file) {
      if (file.path[file.path.length - 1] === '/') {
        self.debug && console.log('don\'t append to zip', file.path)
        return
      }
      let fname
      if (filesZip) {
        // Place files_s3[i] into the archive as files_zip[i]
        const i = filesS3.indexOf(file.path.startsWith(folder) ? file.path.substr(folder.length) : file.path)
        fname = (i >= 0 && i < filesZip.length) ? filesZip[i] : file.path
      } else {
        if (self.aliasConfig) {
          let fileConf = self.aliasConfig.find(fileConf => {
            return fileConf.name === file.path
          })
          fname = (fileConf ? fileConf.alias : file.path)
        } else {
          fname = file.path
        }
      }
      const entryData = typeof fname === 'object' ? fname : { name: fname }
      self.debug && console.log('append to zip', fname)
      if (file.data.length === 0) {
        archive.append('', entryData)
      } else {
        archive.append(file.data, entryData)
      }
    })
    .on('end', function () {
      self.debug && console.log('end -> finalize')
      archive.finalize()
    })
    .on('error', function (err) {
      archive.emit('error', err)
    })

  return archive
}

s3Zip.setFormat = function (format) {
  this.format = format
  return this
}

s3Zip.setArchiverOptions = function (archiverOpts) {
  this.archiverOpts = archiverOpts
  return this
}
