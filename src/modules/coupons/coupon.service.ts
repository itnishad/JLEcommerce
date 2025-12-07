import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Coupon, Prisma } from '../../../generated/prisma/client'
import { max } from 'rxjs';

@Injectable()
export class CouponService {
    constructor(private prisma: DatabaseService) { }

    async validateCoupon(code: string, userId: string, cart: any) {
        const coupon = await this.prisma.coupon.findUnique({
            where: { code },
            include: {
                couponProducts: {
                    include: {
                        product: true
                    }
                }
            }
        });

        if (!coupon) {
            throw new NotFoundException('Coupon not found');
        }

        if (!coupon.isActive) {
            throw new BadRequestException('Coupon is not active');
        }

        // Maximum number of total uses (system-wide).
        if (coupon.maxTotalUses && coupon.currentTotalUses >= coupon.maxTotalUses) {
            throw new BadRequestException('Coupon usage limit reached');
        }

        const now = new Date();

        // Start time and expiry time
        if (now < coupon.startTime) {
            throw new BadRequestException('Coupon is not yet valid');
        }

        if (now > coupon.expiryTime) {
            throw new BadRequestException('Coupon has expired');
        }

        // Maximum number of uses per user.
        if (coupon.maxUsesPerUser) {
            const userUsageCount = await this.prisma.couponUsage.count({
                where: {
                    couponId: coupon.id,
                    userId,
                }
            })

            if (userUsageCount >= coupon.maxUsesPerUser) {
                throw new BadRequestException(`Minium ${coupon.minCartItems} items required in cart`);
            }
        }

        // Minimum cart size (number of items).
        const cartItemCount = cart.cartItems.reduce((sum, item) => sum + item.quantity, 0);
        if (cartItemCount < coupon.minCartItems) {
            throw new BadRequestException(`Minium ${coupon.minCartItems} items required in cart`);
        }

        // Minimum total price required.
        const subtotal = cart.cartItems.reduce((sum, item) => sum + Number(item.priceAtAddition) * item.quantity, 0)
        if (subtotal < Number(coupon.minTotalPrice)) {
            throw new BadRequestException(`Minium cart value of ${coupon.minTotalPrice} required`);
        }

        // Product-specific restrictions (coupon applies only to certain products).
        if (coupon.couponProducts.length > 0) {
            const couponProductIds = coupon.couponProducts.map((p) => p.productId);
            const hasEligibleProduct = cart.items.some((item) => couponProductIds.includes(item.productId));

            if (!hasEligibleProduct) {
                throw new BadRequestException(`Coupon is not applicable to products in your cart`);
            }
        }


        let discountAmount = 0;

        if (coupon.discountType === 'FIXED') {
            discountAmount = Math.min(Number(coupon.maxDiscountAmount), Number(coupon.discountValue))
        } else if (coupon.discountType === 'PERCENTAGE') {
            const rawDiscount = (subtotal * Number(coupon.discountValue)) / 100
            discountAmount = coupon.maxDiscountAmount ? Math.min(rawDiscount, Number(coupon.maxDiscountAmount)) : rawDiscount
        }

        discountAmount = Math.min(discountAmount, subtotal)
        discountAmount = Math.max(0, discountAmount)

        return {
            coupon,
            discountAmount
        }


    }

    async removeCouponFromCart(id: string) {
        return this.prisma.cartCoupon.delete({
            where: { id }
        })
    }

    async getEligibleAutoApplyCoupons(userId: string, cart: any) {
        const now = new Date();
        const autoApplyCoupons = await this.prisma.coupon.findMany({
            where: {
                isAutoApplied: true,
                isActive: true,
                startTime: { lte: now },
                expiryTime: { gte: now }
            },
            include: {
                couponProducts: {
                    include: {
                        product: true
                    }
                }
            }
        })

        const eligibleCoupons: any[] = [];

        for (const coupon of autoApplyCoupons) {
            try {
                await this.validateCoupon(coupon.code, userId, cart)
                eligibleCoupons.push(coupon)
            } catch (error) {
                continue
            }
        }

        return eligibleCoupons
    }

    async validateAndApplyCoupon(code: string, userId: string, cart: any) {
        const {coupon} = await this.validateCoupon(code, userId, cart)
        return coupon
    }
}
