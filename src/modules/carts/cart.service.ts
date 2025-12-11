import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CartRepository } from './cart.repository';
import { ProductRepository } from '../products/product.repository';
import { CouponService } from '../coupons/coupon.service';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class CartService {
    constructor(private cartRepository: CartRepository, private productRepository: ProductRepository, private couponService: CouponService, private prisma: DatabaseService) { }

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

        if (quantity <= 0) {
            throw new BadRequestException('Quantity must be greater than 0');
        }

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

        return await this.formatCartResponse(updatedCart, userId)
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

        await this.revalidateAppliedCoupons(userId, cartItem.cartId)

        await this.recalculateCartCoupons(cartItem.cartId);

        const autoAppliedCoupons = await this.applyAutoApplyCoupons(userId, cartItem.cartId);

        const updatedCart = await this.cartRepository.findCartById(cartItem.cartId);

        return {
            cartItem: updatedItem,
            cart: await this.formatCartResponse(updatedCart, userId)
        }

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

        await this.revalidateAppliedCoupons(userId, cartItem.cartId);

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

    private async applyAutoApplyCoupons(userId: string, cartId: string) {
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

    private async revalidateAppliedCoupons(userId: string, cardId: string) {
        const cart = await this.cartRepository.findCartById(cardId);

        if (!cart || cart.cartCoupons.length === 0) return []

        const removeCoutpons: unknown[] = []

        for (const cartCoupon of cart.cartCoupons) {
            const coupon = cartCoupon.coupon
            try {
                // Validate basic rules
                const now = new Date();

                if (!coupon.isActive) {
                    throw new Error('Coupon is no longer active');
                }

                if (now < coupon.startTime) {
                    throw new Error('Coupon is not yet valid');
                }

                if (now > coupon.expiryTime) {
                    throw new Error('Coupon has expired');
                }

                // Validate min cart items
                const cartItemCount = cart.cartItems.reduce((sum, item) => sum + item.quantity, 0);
                if (cartItemCount < coupon.minCartItems) {
                    throw new Error(`Minimum ${coupon.minCartItems} items required`);
                }

                // Validate min total price (check eligible items only)
                const eligibleItems = await this.getEligibleItemsForCoupon(coupon, cart.cartItems);
                const eligibleSubtotal = eligibleItems.reduce((sum, item) => sum + Number(item.priceAtAddition) * item.quantity, 0)

                if (eligibleSubtotal < Number(coupon.minTotalPrice)) {
                    throw new Error(`Minimum cart value of ${coupon.minTotalPrice} required`);
                }

                // Validate product restrictions - at least one eligible product
                if (coupon.couponProducts && coupon.couponProducts.length > 0) {
                    const couponProductIds = coupon.couponProducts.map((p) => p.productId);
                    const hasEligibleProduct = cart.cartItems.some((item) =>
                        couponProductIds.includes(item.productId),
                    );

                    if (!hasEligibleProduct) {
                        throw new Error('No eligible products in cart');
                    }
                }

                // If we get here, coupon is still valid - continue to next

            } catch (error) {
                await this.cartRepository.removeCouponFromCart(cartCoupon.cartId, cartCoupon.couponId)
                removeCoutpons.push({
                    id: coupon.id,
                    code: coupon.code,
                    reason: error.message,
                });
            }
        }

        return removeCoutpons
    }

    async applyCoupon(userId: string, code: string) {
        const cart = await this.cartRepository.findCartByUserId(userId);
        if (!cart) {
            throw new NotFoundException('Cart not found');
        }

        const coupon = await this.couponService.validateAndApplyCoupon(code, userId, cart)

        const discountAmount = await this.calculateCouponDiscount(coupon, cart);

        await this.cartRepository.addCouponToCart(cart.id, coupon.id, discountAmount, false)

        const updatedCart = await this.cartRepository.findCartById(cart.id)

        return {
            coupon: {
                id: coupon.id,
                code: coupon.code,
                discountAmount
            },
            cart: await this.formatCartResponse(updatedCart, userId)
        }
    }

    async processCheckout(userId: string) {
        return await this.prisma.$transaction(async (tx) => {
            const cart = await tx.cart.findFirst({
                where: {
                    userId: userId,
                    status: 'active'
                },
                include: {
                    cartItems: {
                        include: {
                            product: true
                        }
                    },
                    couponUsages: {
                        include: {
                            coupon: true
                        }
                    }
                }
            })

            if (!cart) {
                throw new NotFoundException('Active cart not found');
            }

            if (!cart.cartItems || cart.cartItems.length === 0) {
                throw new NotFoundException('Cart is empty');
            }

            const processedCoupons: unknown[] = [];

            for (const item of cart.cartItems) {
                if (item.product.stockQuantity < item.quantity) {
                    throw new BadRequestException(
                        `Insufficient stock for ${item.product.name}. Available: ${item.product.stockQuantity}, Required: ${item.quantity}`,
                    );
                }
                const cartCoupons = await tx.cartCoupon.findMany({
                    where: {
                        cartId: cart.id 
                    },
                    include: {
                        coupon: true
                    }
                });

                for (const cartCoupon of cartCoupons) {
                const lockedCoupon = await tx.coupon.findUnique({
                    where: { id: cartCoupon.coupon.id },
                });

                if (!lockedCoupon) {
                    throw new BadRequestException(`Coupon ${cartCoupon.coupon.code} no longer exists`);
                }

                if (!lockedCoupon.isActive) {
                    throw new BadRequestException(`Coupon ${cartCoupon.coupon.code} is no longer active`);
                }

                // Check if coupon has expired
                const now = new Date();
                if (now > lockedCoupon.expiryTime) {
                    throw new BadRequestException(`Coupon ${cartCoupon.coupon.code} has expired`);
                }

                // Check max total uses (system-wide limit)
                if (lockedCoupon.maxTotalUses &&
                    lockedCoupon.currentTotalUses >= lockedCoupon.maxTotalUses) {
                    throw new BadRequestException(
                        `Coupon ${cartCoupon.coupon.code} has reached its usage limit`
                    );
                }

                if (lockedCoupon.maxUsesPerUser) {
                    const userUsageCount = await tx.couponUsage.count({
                        where: {
                            couponId: cartCoupon.coupon.id,
                            userId,
                        },
                    });

                    if (userUsageCount >= lockedCoupon.maxUsesPerUser) {
                        throw new BadRequestException(
                            `You have reached the usage limit for coupon ${cartCoupon.coupon.code}`
                        );
                    }
                }
                const rs = await tx.coupon.update({
                    where: { id: cartCoupon.coupon.id },
                    data: {
                        currentTotalUses: {
                            increment: 1,
                        },
                    },
                });
                const ps = await tx.couponUsage.create({
                    data: {
                        couponId: cartCoupon.coupon.id,
                        userId,
                        cartId: cart.id,
                        discountAmount: cartCoupon.discountAmount,
                    },
                });

                processedCoupons.push({
                    code: cartCoupon.coupon.code,
                    discountAmount: Number(cartCoupon.discountAmount),
                });
            }
            }
            for (const item of cart.cartItems) {
                await tx.product.update({
                    where: { id: item.productId },
                    data: {
                        stockQuantity: {
                            decrement: item.quantity,
                        },
                    },
                });
            }

            await tx.cart.update({
                where: { id: cart.id },
                data: {
                    status: 'checked_out',
                },
                include: {
                    cartItems: {
                        include: {
                            product: true,
                        },
                    },
                },
            });

            await tx.cartCoupon.deleteMany({
                where: { cartId: cart.id },
            });

            return 'Checkout successful';

        }, { isolationLevel: 'Serializable', timeout: 15000 });
    }
}
