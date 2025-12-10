import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CartService } from './cart.service';
import { CartRepository } from './cart.repository';
import { ProductRepository } from '../products/product.repository';
import { CouponService } from '../coupons/coupon.service';
import { DatabaseService } from '../../database/database.service';
import { Decimal } from '@prisma/client/runtime/client.js'

describe('CartService', () => {
  let service: CartService;
  let cartRepository: jest.Mocked<CartRepository>;
  let productRepository: jest.Mocked<ProductRepository>;
  let couponService: jest.Mocked<CouponService>;
  let prismaService: jest.Mocked<DatabaseService>;

  const mockUserId = 'user-123';
  const mockCartId = 'cart-123';
  const mockProductId = 'product-123';
  const mockCouponId = 'coupon-123';

  const mockProduct = {
    id: mockProductId,
    name: 'Test Product',
    description: 'Test Description',
    price: new Decimal(100),
    stockQuantity: 10,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCart = {
    id: mockCartId,
    userId: mockUserId,
    status: 'active' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    cartItems: [],
    cartCoupons: [],
  };

  const mockCoupon = {
    id: mockCouponId,
    code: 'SAVE10',
    description: '10% off',
    discountType: 'fixed',
    discountValue: new Decimal(10),
    maxDiscountAmount: null,
    isAutoApplied: false,
    startTime: new Date('2024-01-01'),
    expiryTime: new Date('2025-12-31'),
    minCartItems: 0,
    minTotalPrice: new Decimal(0),
    maxTotalUses: null,
    maxUsesPerUser: null,
    currentTotalUses: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    couponProducts: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        {
          provide: CartRepository,
          useValue: {
            findCartByUserId: jest.fn(),
            createCart: jest.fn(),
            addItemToCart: jest.fn(),
            updateCartItem: jest.fn(),
            removeCartItem: jest.fn(),
            findCartById: jest.fn(),
            clearCartItems: jest.fn(),
            clearCartCoupons: jest.fn(),
            addCouponToCart: jest.fn(),
            removeCouponFromCart: jest.fn(),
            findCartCoupon: jest.fn(),
            updateCartCoupon: jest.fn(),
            findCartItemById: jest.fn(),
          }
        },
        {
          provide: ProductRepository,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: CouponService,
          useValue: {
            getCoupon: jest.fn(),
            validateAndApplyCoupon: jest.fn(),
            getEligibleAutoApplyCoupons: jest.fn(),
          },
        },
        {
          provide: DatabaseService,
          useValue: {
            cart: {
              findUnique: jest.fn(),
            },
            cartCoupon: {
              update: jest.fn(),
              deleteMany: jest.fn(),
            },
          },
        }

      ],
    }).compile();

    service = module.get<CartService>(CartService);
    cartRepository = module.get(CartRepository);
    productRepository = module.get(ProductRepository);
    couponService = module.get(CouponService);
    prismaService = module.get(DatabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getActiveCart', () => {
    it('should return existing active cart', async () => {
      const mockCartWithItems = {
        ...mockCart,
        cartItems: [
          {
            id: 'item-1',
            cartId: mockCartId,
            productId: mockProductId,
            quantity: 2,
            priceAtAddition: new Decimal(100),
            createdAt: new Date(),
            updatedAt: new Date(),
            product: mockProduct,
          },
        ],
      };

      cartRepository.findCartByUserId.mockResolvedValue(mockCartWithItems);

      const result = await service.getCart(mockUserId);

      expect(cartRepository.findCartByUserId).toHaveBeenCalledWith(mockUserId);
      expect(result).toHaveProperty('id', mockCartId);
      expect(result.cartItems).toHaveLength(1);
      expect(result.summary.subtotal).toBe(200);
    })
    it('should create new cart if none exists', async () => {
      cartRepository.findCartByUserId.mockResolvedValue(null);
      cartRepository.createCart.mockResolvedValue(mockCart);

      const result = await service.getCart(mockUserId);

      expect(cartRepository.createCart).toHaveBeenCalledWith(mockUserId);
      expect(result).toHaveProperty('id', mockCartId);
    });
  })

  describe('addItem', () => {
    it('should add item to cart successfully', async () => {
      const quantity = 2;
      const mockCartItem = {
        id: 'item-1',
        cartId: mockCartId,
        productId: mockProductId,
        quantity,
        priceAtAddition: new Decimal(100),
        createdAt: new Date(),
        updatedAt: new Date(),
        product: mockProduct,
      };

      productRepository.findById.mockResolvedValue(mockProduct);
      cartRepository.findCartByUserId.mockResolvedValue(mockCart);
      cartRepository.addItemToCart.mockResolvedValue(mockCartItem);
      (prismaService.cart.findUnique as jest.Mock).mockResolvedValue(mockCart);
      couponService.getEligibleAutoApplyCoupons.mockResolvedValue([]);
      cartRepository.findCartById.mockResolvedValue({
        ...mockCart,
        cartItems: [mockCartItem],
      });

      const result = await service.addItem(mockUserId, mockProductId, quantity);
      expect(productRepository.findById).toHaveBeenCalledWith(mockProductId);
      expect(result).toHaveProperty('cartItems');
    });

    it('should throw BadRequestException for invalid quantity', async () => {
      await expect(service.addItem(mockUserId, mockProductId, 0)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.addItem(mockUserId, mockProductId, -1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if product not found', async () => {
      productRepository.findById.mockResolvedValue(null);

      await expect(service.addItem(mockUserId, mockProductId, 2)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if product is not active', async () => {
      productRepository.findById.mockResolvedValue({
        ...mockProduct,
        isActive: false,
      });

      await expect(service.addItem(mockUserId, mockProductId, 2)).rejects.toThrow(
        new BadRequestException('Product is not available'),
      );
    });

    it('should throw BadRequestException if insufficient stock', async () => {
      productRepository.findById.mockResolvedValue({
        ...mockProduct,
        stockQuantity: 1,
      });

      await expect(service.addItem(mockUserId, mockProductId, 5)).rejects.toThrow(
        new BadRequestException('Insufficient stock'),
      );
    });

    it('should auto-apply eligible coupons when adding item', async () => {
      const mockCartItem = {
        id: 'item-1',
        cartId: mockCartId,
        productId: mockProductId,
        quantity: 2,
        priceAtAddition: new Decimal(100),
        createdAt: new Date(),
        updatedAt: new Date(),
        product: mockProduct,
      };

      const mockAutoApplyCoupon = {
        ...mockCoupon,
        isAutoApplied: true,
      };

      productRepository.findById.mockResolvedValue(mockProduct);
      cartRepository.findCartByUserId.mockResolvedValue(mockCart);
      cartRepository.addItemToCart.mockResolvedValue(mockCartItem);
      (prismaService.cart.findUnique as jest.Mock).mockResolvedValue({
        ...mockCart,
        items: [mockCartItem],
      });
      couponService.getEligibleAutoApplyCoupons.mockResolvedValue([mockAutoApplyCoupon]);
      couponService.getCoupon.mockResolvedValue(mockCoupon)
      cartRepository.addCouponToCart.mockResolvedValue({
        id: 'cart-coupon-1',
        cartId: mockCartId,
        couponId: mockCouponId,
        discountAmount: new Decimal(20),
        isAutoApplied: true,
        appliedAt: new Date(),
        coupon: mockAutoApplyCoupon,
      });
      cartRepository.findCartById.mockResolvedValue({
        ...mockCart,
        cartItems: [mockCartItem],
        cartCoupons: [],
      });

      const result = await service.addItem(mockUserId, mockProductId, 2);

      expect(couponService.getEligibleAutoApplyCoupons).toHaveBeenCalled();
      expect(result.appliedCoupons).toBeDefined();
    });
  });

  describe('updateItem', ()=>{
    const mockCartItem = {
      id: 'item-1',
      cartId: mockCartId,
      productId: mockProductId,
      quantity: 2,
      priceAtAddition: new Decimal(100),
      createdAt: new Date(),
      updatedAt: new Date(),
      cart: mockCart,
      product: mockProduct,
    };

    it('should throw BadRequestException for invalid quantity', async () => {
      await expect(service.updateItem(mockUserId, 'item-1', 0)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if cart item not found', async () => {
      cartRepository.findCartItemById.mockResolvedValue(null);

      await expect(service.updateItem(mockUserId, 'item-1', 2)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if unauthorized access', async () => {
      cartRepository.findCartItemById.mockResolvedValue({
        ...mockCartItem,
        cart: { ...mockCart, userId: 'different-user' },
      });

      await expect(service.updateItem(mockUserId, 'item-1', 2)).rejects.toThrow(
        new BadRequestException('Unauthorized access to cart item'),
      );
    });

    it('should throw BadRequestException if insufficient stock', async () => {
      cartRepository.findCartItemById.mockResolvedValue({
        ...mockCartItem,
        product: { ...mockProduct, stockQuantity: 3 },
      });

      await expect(service.updateItem(mockUserId, 'item-1', 10)).rejects.toThrow(
        new BadRequestException('Insufficient stock'),
      );
    });
  })

  describe('applyCoupon', () => {
    const couponCode = 'SAVE10';

    it('should apply coupon successfully', async () => {
      const mockCartWithItems = {
        ...mockCart,
        cartItems: [
          {
            id: 'item-1',
            cartId: mockCartId,
            productId: mockProductId,
            quantity: 2,
            priceAtAddition: new Decimal(100),
            createdAt: new Date(),
            updatedAt: new Date(),
            product: mockProduct,
          },
        ],
      };

      cartRepository.findCartByUserId.mockResolvedValue(mockCartWithItems);
      couponService.validateAndApplyCoupon.mockResolvedValue(mockCoupon);
      cartRepository.addCouponToCart.mockResolvedValue({
        id: 'cart-coupon-1',
        cartId: mockCartId,
        couponId: mockCouponId,
        discountAmount: new Decimal(20),
        isAutoApplied: false,
        appliedAt: new Date(),
        coupon: mockCoupon,
      });
      cartRepository.findCartById.mockResolvedValue({
        ...mockCartWithItems,
        cartCoupons: [
          {
            id: 'cart-coupon-1',
            cartId: mockCartId,
            couponId: mockCouponId,
            discountAmount: new Decimal(20),
            isAutoApplied: false,
            appliedAt: new Date(),
            coupon: mockCoupon,
          },
        ],
      });

      const result = await service.applyCoupon(mockUserId, couponCode);
      expect(couponService.validateAndApplyCoupon).toHaveBeenCalledWith(
        couponCode,
        mockUserId,
        mockCartWithItems,
      );
      expect(cartRepository.addCouponToCart).toHaveBeenCalled();
      expect(result.coupon.code).toBe(couponCode);
    });

    it('should throw NotFoundException if cart not found', async () => {
      cartRepository.findCartByUserId.mockResolvedValue(null);

      await expect(service.applyCoupon(mockUserId, couponCode)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
