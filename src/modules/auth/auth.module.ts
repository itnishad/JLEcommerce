import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configSrvice: ConfigService) => ({
        secret: configSrvice.get<string>('JWT_AUTH_SECRECT')
      }),
      inject:[ConfigService]
    })
  ],
  controllers: [AuthController],
  providers: [AuthService]
})
export class AuthModule {}
