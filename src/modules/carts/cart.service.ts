import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { User, Prisma } from '../../../generated/prisma/client'

@Injectable()
export class CartService {
    constructor(private prisma: DatabaseService) { }

    private formatCartResponse(cart) {
        const items = cart.cartItems.map((item) => ({
            id: item.id,
            productId: item.productId,
            productName: item.product.name,
            quantity: item.quantity,
            priceAtAddition: Number(item.priceAtAddition),
            subtotal: Number(item.priceAtAddition) * item.quantity,
        }))

        const subtotal = items.reduce((sum, item) => {
            return sum + Number(item.priceAtAddition) * item.quantity;
        }, 0)

        const totalDiscount = cart.cartCoupons.reduce((sum, c) => sum + Number(c.discountAmount), 0)
        const finalAmount = Math.max(0, subtotal - totalDiscount);

        return {
            id: cart.id,
            userId: cart.userId,
            items,
            appliedCoupons: cart.cartCoupons.map((c) => ({
                id: c.coupon.id,
                code: c.coupon.code,
                discountAmount: Number(c.discountAmount),
                isAutoApplied: c.isAutoApplied,
            })),
            summary: {
                subtotal: Number(subtotal.toFixed(2)),
                totalDiscount: Number(totalDiscount.toFixed(2)),
                finalAmount: Number(finalAmount.toFixed(2)),
                itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
            }
        }
    }

    async getCart(userId: string) {

        //Get user cart
        let cart = await this.prisma.cart.findUnique({
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

        //if cart not found then create a new cart
        if (!cart) {
            cart = await this.prisma.cart.create({
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
        console.log({cart})
        // after found or create a cart then calculate cart item and return cart resposnse
        return this.formatCartResponse(cart)
    }
}
