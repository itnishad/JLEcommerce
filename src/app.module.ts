import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import config from './configuration/config';
import envSchema from './configuration/schema';
import { DatabaseModule } from './database/database.module';
import { CartModule } from './modules/carts/cart.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/users/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [config],
      validate: (env) => {
        const result = envSchema.safeParse(env);
        if (!result.success) {
          throw new Error(
            `Configuration validation error: ${result.error.message}`,
          );
        }
        return result.data;
      },
    }),
    DatabaseModule,
    UserModule,
    AuthModule,
    CartModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
