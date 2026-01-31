declare module 'ali-oss' {
  interface OSSOptions {
    region?: string;
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    endpoint?: string;
    secure?: boolean;
    timeout?: number;
  }

  interface PutObjectOptions {
    mime?: string;
    partSize?: number;
    progress?: (percent: number, checkpoint?: any, res?: any) => void;
  }

  interface PutObjectResult {
    url: string;
    name: string;
    res: {
      status: number;
      statusCode: number;
      headers: Record<string, string>;
    };
  }

  class OSS {
    constructor(options: OSSOptions);
    put(name: string, file: Blob | File, options?: PutObjectOptions): Promise<PutObjectResult>;
    multipartUpload(name: string, file: Blob | File, options?: PutObjectOptions): Promise<PutObjectResult>;
  }

  export = OSS;
}

