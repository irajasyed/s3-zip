const s3Files = require('s3-files')
const archiver = require('archiver')
const streamify = require('stream-array')

const s3Zip = {}
module.exports = s3Zip

s3Zip.archive = function (opts, fileInfo, filesZip) {
  const self = this

  let connectionConfig

  this.fileInfo = fileInfo

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
  const filesS3 = self.getFiles(fileInfo)
  const keyStream = self.createKeyStream(fileInfo)

  const preserveFolderStructure = opts.preserveFolderStructure === true || filesZip
  const fileStream = s3Files.createFileStream(keyStream, preserveFolderStructure)
  const archive = self.archiveStream(fileStream, filesS3, filesZip)

  return archive
}

s3Zip.getFiles = function (fileInfo) {
  return fileInfo.map(fileMeta => {
    return fileMeta.key
  })
}

s3Zip.createKeyStream = function (fileInfo) {
  if (!fileInfo.length) return null
  var paths = []
  fileInfo.forEach(function (fileMeta) {
    paths.push(fileMeta.folder + fileMeta.key)
  })
  return streamify(paths)
}

s3Zip.getFolderName = function (filePath) {
  let fileMeta = this.fileInfo.find(fileMeta => {
    return fileMeta.key === file.path
  })
  return fileMeta.folder
}

s3Zip.archiveStream = function (stream, filesS3, filesZip) {
  const self = this
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
        const folder = self.getFolderName(file.path)
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
