import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { User, Prisma } from '../../../generated/prisma/client'
@Injectable()
export class CartRepository {
  constructor(private prisma: DatabaseService) { }

  async findCartByUserId(userId: string) {
    return this.prisma.cart.findUnique({
      where: {
        userId_status: {
          userId, status: 'active'
        }
      },
      include: {
        cartItems: {
          include: {
            product: true
          }
        },
        cartCoupons: {
          include: {
            coupon: true
          }
        }
      }
    })
  }

  async findCartById(id: string) {
    return this.prisma.cart.findUnique({
      where: { id },
      include: {
        cartItems: { include: { product: true } },
        cartCoupons: { include: { coupon: { include: { couponProducts: true } } } },
      },
    });
  }

  async createCart(userId: string) {
    return this.prisma.cart.create({
      data: {
        userId,
        status: 'active'
      },
      include: {
        cartItems: {
          include: {
            product: true
          }
        },
        cartCoupons: {
          include: {
            coupon: true
          }
        }
      }
    })
  }

  async addItemToCart(cartId: string, productId: string, quantity: number, price: number) {
    return this.prisma.cartItem.upsert({
      where: {
        cartId_productId: {
          cartId,
          productId,
        }
      },
      update: {
        quantity: {
          increment: quantity
        }
      },
      create: {
        cartId,
        productId,
        quantity,
        priceAtAddition: price
      },
      include: {
        product: true
      }
    })
  }

  async updateCartCoupon(id: string, discountAmount: number) {
    await this.prisma.cartCoupon.update({
      where: { id },
      data: { discountAmount },
    });
  }

  async addCouponToCart(cartId: string, couponId: string, discountAmount: number, isAutoApplied: boolean) {
    return this.prisma.cartCoupon.create({
      data: {
        cartId,
        couponId,
        discountAmount,
        isAutoApplied,
      },
      include: {
        coupon: true,
      },
    })
  }
}
