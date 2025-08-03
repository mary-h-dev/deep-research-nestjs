import { HttpStatus } from '@nestjs/common'
import { HttpException } from '@nestjs/common'


export class HandleException extends HttpException {
  constructor(
    public readonly errKey: string,
    private readonly statusCode?: HttpStatus,
    private readonly metadata?: object,
  ) {
    super(
      {
        errKey,
        statusCode: statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
        metadata: metadata || {},
      },
      statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
    )

    if ((process.env.NODE_ENV === 'development', metadata)) console.log(metadata)
  }
}
