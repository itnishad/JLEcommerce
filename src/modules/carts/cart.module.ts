import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartRepository } from './cart.repository';
import { ProductModule } from '../products/product.module';
import { CouponModule } from '../coupons/coupon.module';

@Module({
  imports :[ProductModule, CouponModule],
  controllers: [CartController],
  providers: [CartService, CartRepository],
})
export class CartModule {}
