import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { CartService } from './cart.service';
import { AuthGuard } from '@nestjs/passport';
import { requestWithUser } from '../../decorators/user.decorator';
import { type User } from '../../../generated/prisma/client'
import { type AddItemDto, addItemSchema } from './dto/addItem.dto';
import { ZodValidationPipe } from 'src/pipes/validation.pipe';
import { type UpdateItemDto, updateItemSchema } from './dto/updateItem.dto';

@Controller('cart')
@UseGuards(AuthGuard('jwt'))
export class CartController {
    constructor(private readonly cartService: CartService) { }

    @Get()
    async getCart(
        @requestWithUser() user: User
    ) {
        return await this.cartService.getCart(user.id)
    }

    @Post('items')
    async addItem(
        @Body(new ZodValidationPipe(addItemSchema)) addItemDto: AddItemDto,
        @requestWithUser() user: User
    ) {
        return this.cartService.addItem(user.id, addItemDto.productId, addItemDto.quantity)
    }

    @Patch('items/:itemId')
    async updateItem(
        @Param('itemId') itemId: string,
        @Body(new ZodValidationPipe(updateItemSchema)) updateItemDto: UpdateItemDto,
        @requestWithUser() user: User
    ) {
        const result = await this.cartService.updateItem(user.id, itemId, updateItemDto.quantity);
        return {
            success: true,
            message: 'Cart item updated',
            data: result,
        };
    }

    @Delete('items/:itemId')
    async removeItem(@Param('itemId') itemId: string, @requestWithUser() user: User) {
        const cart = await this.cartService.removeItem(user.id, itemId);
        return {
            success: true,
            message: 'Item removed from cart',
            data: cart ,
        };
    }


}
