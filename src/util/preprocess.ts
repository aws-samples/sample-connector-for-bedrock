import sharp from 'sharp';
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

export default {
  async scaleDownImage(input: Buffer | ArrayBuffer | Uint8Array | Uint8ClampedArray | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array | Float64Array | string, factor: number, max?: number) {
    const metadata = await sharp(input).metadata();
    // console.log(metadata);
    const { width, height } = this.scaleDownSize(metadata.width, metadata.height, factor, max);
    return await sharp(input)
      .resize(width, height, {
        fit: sharp.fit.cover
      })
      .jpeg()
      // .toFile("/Users/wellxie/projects/ai/sample-connector-for-bedrock/api-test/1.webp");
      .toBuffer();
  },

  scaleDownSize(width: number, height: number, factor: number, max?: number) {
    if (max && max > 128) {
      const smax = Math.max(width, height);
      if (smax > max) {
        const scaleFactor = max / smax;
        // console.log("dev...", width, height, factor, max, smax, scaleFactor);
        width = Math.round(width * scaleFactor);
        height = Math.round(height * scaleFactor);
      }

    }

    // console.log("dev2...", width, height, factor, max);
    width = this.scaleDownNumber(width, factor);
    height = this.scaleDownNumber(height, factor);

    // console.log("dev3...", width, height, factor, max);
    return {
      width, height
    }
  },

  scaleDownNumber(num: number, factor: number) {
    return Math.floor(num / factor) * factor;
  },

  scaleUpNumber(num: number, factor: number) {
    return Math.ceil(num / factor) * factor;
  },

  async downloadImageForNovaToBase64(url: string, client: S3Client): Promise<any> {
    if (url.indexOf('http://') >= 0 || url.indexOf('https://') >= 0) {
      const imageReq = await fetch(url);
      const blob = await imageReq.blob();
      let buffer = Buffer.from(await blob.arrayBuffer());
      let nbuffer = await this.scaleDownImage(buffer, 16, 2048);
      return nbuffer.toString('base64');
    } else if (url.indexOf('s3://') >= 0) {
      const urlParts = url.replace('s3://', '').split('/');
      const bucketName = urlParts.shift();
      const key = urlParts.join('/');
      const params = {
        Bucket: bucketName,
        Key: key,
      };

      try {
        const command = new GetObjectCommand(params);
        const response = await client.send(command);
        const byteArray = await response.Body.transformToByteArray();
        let nbuffer = await this.scaleDownImage(byteArray, 16, 2048);
        return nbuffer.toString('base64');

      } catch (error) {
        // console.error("Error downloading and converting image:", error);
        throw error;
      }

    }
  },

}