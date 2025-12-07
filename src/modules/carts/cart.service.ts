import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CartRepository } from './cart.repository';
import { ProductRepository } from '../products/product.repository';
import { CouponService } from '../coupons/coupon.service';


@Injectable()
export class CartService {
    constructor(private cartRepository: CartRepository, private productRepository: ProductRepository, private couponService: CouponService) { }

    async getCart(userId: string) {

        //Get user cart
        let cart = await this.cartRepository.findCartByUserId(userId)

        //if cart not found then create a new cart
        if (!cart) {
            cart = await this.cartRepository.createCart(userId)
        }

        // after found or create a cart then calculate cart item and return cart resposnse
        return this.formatCartResponse(cart, userId)
    }

    async addItem(userId: string, productId: string, quantity: number) {
        const product = await this.productRepository.findById(userId)

        if (!product) {
            throw new NotFoundException('Product not found')
        }

        if (!product.isActive) {
            throw new BadRequestException('Product is not available');
        }

        if (product.stockQuantity < quantity) {
            throw new BadRequestException('Insufficient stock')
        }

        let cart = await this.cartRepository.findCartByUserId(userId)

        if (!cart) {
            cart = await this.cartRepository.createCart(userId)
        }

        const cartItem = await this.cartRepository.addItemToCart(cart.id, productId, quantity, Number(product.price))

        await this.recalculateCartCoupons(cart.id)
    }

    private async formatCartResponse(cart, userId) {
        const cartItems = cart.cartItems.map((item) => ({
            id: item.id,
            productId: item.productId,
            productName: item.product.name,
            quantity: item.quantity,
            priceAtAddition: Number(item.priceAtAddition),
            subtotal: Number(item.priceAtAddition) * item.quantity,
        }))

        const subtotal = cartItems.reduce((sum, item) => {
            return sum + Number(item.priceAtAddition) * item.quantity;
        }, 0)

        let totalDiscount = 0;
        const validCoupons: {
            id: string,
            code: string,
            discountAmount: number
            isAutoApplied: boolean
        }[] = [];

        for (const appliedCoupon of cart.cartCoupons) {
            try {
                const { discountAmount } = await this.couponService.validateCoupon(appliedCoupon.coupon.code, userId, cart)
                totalDiscount += discountAmount
                validCoupons.push({
                    id: appliedCoupon.id,
                    code: appliedCoupon.coupon.code,
                    discountAmount,
                    isAutoApplied: appliedCoupon.coupon.isAutoApplied
                })
            } catch (error) {
                await this.couponService.removeCouponFromCart(appliedCoupon.id)
            }
        }

        return {
            id: cart.id,
            userId: cart.userId,
            items: cartItems,
            appliedCoupons: validCoupons,
            summary: {
                subtotal: Number(subtotal.toFixed(2)),
                totalDiscount: Number(totalDiscount.toFixed(2)),
                finalAmount: Number(Math.max(0, subtotal - totalDiscount).toFixed(2)),
                itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
            }
        }
    }

    private async recalculateCartCoupons(cartId: string) {
        const cart = await this.cartRepository.findCartById(cartId)
        if (!cart) return;

        for (const cartCoupon of cart.cartCoupons) {
            const newDiscount = this.calculateCouponDiscount(cartCoupon.coupon, cart)
            await this.cartRepository.updateCartCoupon(cartCoupon.id, newDiscount)
        }
    }

    private calculateCouponDiscount(coupon: any, cart: any) {

        const eligibleItems = this.getEligibleItemsForCoupon(coupon, cart.cartItems)

        if(!eligibleItems || eligibleItems.length === 0){
            return 0;
        }

        const itemSubTotal = eligibleItems.reduce((sum, item) => sum + Number(item.priceAtAddition) * item.quantity, 0)


        let discount = 0;

        if (coupon.discountType === 'fixed') {
            discount = Number(coupon.discountValue);
        } else if (coupon.discountType === 'percentage') {
            discount = (itemSubTotal * Number(coupon.discountValue)) / 100;
        }

        if (coupon.maxDiscountAmount) {
            discount = Math.min(discount, Number(coupon.maxDiscountAmount));
        }

        return Math.min(discount, itemSubTotal);
    }

    private getEligibleItemsForCoupon (coupon: any, cartItems: any[]){
        if(!coupon.couponProducts || coupon.couponProducts.length === 0){
            return
        }

        const eligibleProductIds = coupon.couponProducts.map((item) => item.productId)

        return cartItems.filter((item) => eligibleProductIds.includes(item.productId))
    }

    async applyAutoApplyCoupons(userId: string) {
        const cart = await this.cartRepository.findCartByUserId(userId)

        if(!cart) {
            throw new NotFoundException('Cart not found')
        }

        const eligibleCoupons = await this.couponService.getEligibleAutoApplyCoupons(userId, cart)

        const appliedCoupons: unknown[] = [];

        for (const coupon of eligibleCoupons) {
            const discountAmount = this.calculateCouponDiscount(coupon, cart)
            await this.cartRepository.addCouponToCart(cart.id, coupon.id, discountAmount, true)
            appliedCoupons.push({
                id: coupon.id,
                code: coupon.code,
                discountAmount
            })
        }

        const updatedCart = await this.cartRepository.findCartByUserId(userId)

        return{
            cart: this.formatCartResponse(updatedCart, userId),
            appliedCoupons
        }
    }
}
