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
        const product = await this.productRepository.findById(productId)

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

        const autoAppliedCoupons = await this.applyAutoApplyCoupons(userId, cart.id);

        const updatedCart = await this.cartRepository.findCartById(cart.id)

        return this.formatCartResponse(updatedCart, userId)
    }

    async updateItem(userId: string, itemId: string, quantity: number) {
        if (quantity <= 0) {
            throw new BadRequestException('Quantity must be greater than 0');
        }
        const cartItem = await this.cartRepository.findCartItemById(itemId);
        if (!cartItem) {
            throw new NotFoundException('Cart item not found');
        }
        if (cartItem.cart.userId !== userId) {
            throw new BadRequestException('Unauthorized access to cart item');
        }

        if (cartItem.product.stockQuantity < quantity) {
            throw new BadRequestException('Insufficient stock');
        }

        const updatedItem = await this.cartRepository.updateCartItem(itemId, quantity);

        await this.recalculateCartCoupons(cartItem.cartId);

        const autoAppliedCoupons = await this.applyAutoApplyCoupons(userId, cartItem.cartId);

        const updatedCart = await this.cartRepository.findCartById(cartItem.cartId);

        return this.formatCartResponse(updatedCart, userId)

    }

    async removeItem(userId: string, itemId: string) {
        const cartItem = await this.cartRepository.findCartItemById(itemId);
        if (!cartItem) {
            throw new NotFoundException('Cart item not found');
        }

        if (cartItem.cart.userId !== userId) {
            throw new BadRequestException('Unauthorized access to cart item');
        }

        await this.cartRepository.removeCartItem(itemId);

        // Recalculate cart with coupons
        await this.recalculateCartCoupons(cartItem.cartId);

        const updatedCart = await this.cartRepository.findCartById(cartItem.cartId);
        return this.formatCartResponse(updatedCart, userId);
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

        const couponBreakdown = cart.cartCoupons.map((c) => {
            // const eligibleItems = await this.getEligibleItemsForCoupon(c.coupon, cart.cartItems);
            // const eligibleProductIds = eligibleItems.map(item => item.productId);
            return {
                id: c.coupon.id,
                code: c.coupon.code,
                discountAmount: Number(c.discountAmount),
                isAutoApplied: c.isAutoApplied,
            };
        })

        const totalDiscount = cart.cartCoupons.reduce(
            (sum, c) => sum + Number(c.discountAmount),
            0,
        );

        const finalAmount = Math.max(0, subtotal - totalDiscount);


        return {
            id: cart.id,
            userId: cart.userId,
            status: cart.status,
            cartItems,
            appliedCoupons: couponBreakdown,
            summary: {
                subtotal: Number(subtotal.toFixed(2)),
                totalDiscount: Number(totalDiscount.toFixed(2)),
                finalAmount: Number(finalAmount.toFixed(2)),
                itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
            },
        };
    }

    private async recalculateCartCoupons(cartId: string) {
        const cart = await this.cartRepository.findCartById(cartId)
        if (!cart) return;
        for (const cartCoupon of cart.cartCoupons) {
            const newDiscount = await this.calculateCouponDiscount(cartCoupon.coupon, cart)
            await this.cartRepository.updateCartCoupon(cartCoupon.id, newDiscount)
        }
    }

    private async calculateCouponDiscount(coupon: any, cart: any) {

        const eligibleItems = await this.getEligibleItemsForCoupon(coupon, cart.cartItems)

        if (!eligibleItems || eligibleItems.length === 0) {
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

    private async getEligibleItemsForCoupon(coupon: any, cartItems: any[]) {
        const couponInfo = await this.couponService.getCoupon(coupon.code)
        if (!coupon.couponProducts || coupon.couponProducts.length === 0) {
            return cartItems
        }

        const eligibleProductIds = coupon.couponProducts.map((item) => item.productId)
        return cartItems.filter((item) => eligibleProductIds.includes(item.productId))
    }

    async applyAutoApplyCoupons(userId: string, cartId: string) {
        const cart = await this.cartRepository.findCartById(cartId)

        if (!cart) return []

        const eligibleCoupons = await this.couponService.getEligibleAutoApplyCoupons(userId, cart)
        const appliedCoupons: unknown[] = [];

        for (const coupon of eligibleCoupons) {
            const alreadyApplied = cart.cartCoupons.some(c => c.couponId === coupon.id)
            if (alreadyApplied) continue;

            const discountAmount = await this.calculateCouponDiscount(coupon, cart)
            await this.cartRepository.addCouponToCart(cart.id, coupon.id, discountAmount, true)
            appliedCoupons.push({
                id: coupon.id,
                code: coupon.code,
                discountAmount
            })
        }

        return appliedCoupons
    }
}
