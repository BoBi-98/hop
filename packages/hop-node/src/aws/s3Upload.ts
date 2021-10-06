import Logger from 'src/logger'
import fetch from 'node-fetch'
import queue from 'src/decorators/queue'
import { BigNumber } from 'ethers'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { awsAccessKeyId, awsRegion, awsSecretAccessKey } from '../config'
import { boundClass } from 'autobind-decorator'

let credentials
if (awsAccessKeyId) {
  credentials = {
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey
  }
}

type Config = {
  bucket: string
  key: string
}

const client = new S3Client({
  region: awsRegion,
  credentials
})

@boundClass
class S3Upload {
  bucket: string = 'assets.hop.exchange'
  key: string = 'data.json'
  logger: Logger = new Logger('S3Upload')

  constructor (config: Partial<Config> = {}) {
    if (config.bucket) {
      this.bucket = config.bucket
    }
    if (config.key) {
      this.key = config.key
    }
  }

  getQueueGroup () {
    return 's3'
  }

  @queue
  async upload (data: any) {
    try {
      data = JSON.parse(JSON.stringify(data)) // deep clone
      const uploadData = {
        timestamp: Date.now(),
        data: this.bigNumbersToString(data)
      }
      this.logger.debug('uploading')
      const input = {
        Bucket: this.bucket,
        Key: this.key,
        Body: JSON.stringify(uploadData, null, 2),
        ACL: 'public-read'
      }
      const command = new PutObjectCommand(input)
      await client.send(command)
      this.logger.debug('uploaded to s3')
    } catch (err) {
      const msg = err.message
      if (msg.includes('The bucket you are attempting to access must be addressed using the specified endpoint')) {
        throw new Error('could not access bucket. Make sure AWS_REGION is correct')
      }
      throw err
    }
  }

  async getData () {
    const url = `https://${this.bucket}/${this.key}`
    const res = await fetch(url)
    const json = await res.json()
    return json
  }

  bigNumbersToString (data: any) {
    if (typeof data !== 'object') {
      return data
    }

    for (const key in data) {
      if (data[key]?._isBigNumber) {
        data[key] = data[key].toString()
      } else if (data[key]?.type === 'BigNumber') {
        data[key] = BigNumber.from(data[key].hex).toString()
      } else if (typeof data[key] === 'object') {
        data[key] = this.bigNumbersToString(data[key])
      }
    }

    return data
  }
}

export default S3Upload