import helmet from 'helmet'
import express from 'express'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestExpressApplication, ExpressAdapter } from '@nestjs/platform-express'
import { AppModule } from './app.module'
import { TimeoutInterceptor } from './interceptors/timeout.interceptor'
import { AllExceptionsFilter } from './exceptions.filter'
import { isDevEnv, isRunInServerMode } from './utils'
import { TimeCost } from './interceptors/timecost.interceptor'
import { SwaggerModule, DocumentBuilder, SwaggerDocumentOptions } from '@nestjs/swagger'

const expressApp = express()
const adapter = new ExpressAdapter(expressApp)
const port = process.env.SERVER_PORT || 5001

export async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, adapter, {
    logger: ['log', 'error', 'warn'],
  })

  const config = app.get(ConfigService)

  // Security
  app.use(helmet())

  // 参数校验
  app.useGlobalPipes(
    // 将参数转换为 DTO 定义的类型
    new ValidationPipe({
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  )

  // 超时时间
  app.useGlobalInterceptors(new TimeoutInterceptor(config.get('RES_TIMEOUT')))

  // 请求时间
  app.useGlobalInterceptors(new TimeCost())

  // 错误处理
  app.useGlobalFilters(new AllExceptionsFilter())

  // cors
  app.enableCors({
    origin: (requestOrigin: string, callback: (err: Error | null, allow?: boolean) => void) => {
      callback(null, true)
    },
    maxAge: 600,
    credentials: true,
  })

  // hide x-powered-by: express header
  app.disable('x-powered-by')

  // swagger
  if (isDevEnv()) {
    const docConfig = new DocumentBuilder()
      .setTitle('iStep')
      .setDescription('The iStep API Document')
      .setVersion('1.0')
      .addTag('istep')
      .build()

    const options: SwaggerDocumentOptions = {
      operationIdFactory: (_, methodKey: string) => methodKey,
    }
    const document = SwaggerModule.createDocument(app, docConfig, options)

    SwaggerModule.setup('/', app, document)
  }

  // 兼容云函数与本地开发
  if (isRunInServerMode()) {
    await app.listen(port)
  } else {
    await app.init()
  }

  return expressApp
}

if (isRunInServerMode()) {
  bootstrap().then(() => {
    console.log(`\n> 🚀 App listen on http://localhost:${port}`)
  })
}
