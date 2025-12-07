import { Body, Controller, Get, Post, UseGuards, UsePipes } from '@nestjs/common';
import { CartService } from './cart.service';
import { AuthGuard } from '@nestjs/passport';
import { requestWithUser } from '../../decorators/user.decorator';
import {type User} from '../../../generated/prisma/client'
import { type AddItemDto, addItemSchema } from './dto/addItem.dto';
import { ZodValidationPipe } from 'src/pipes/validation.pipe';

@Controller('cart')
@UseGuards(AuthGuard('jwt'))
export class CartController {
    constructor(private readonly cartService: CartService){}

    @Get()
    async getCart(
        @requestWithUser() user: User
    ){
        return await this.cartService.getCart(user.id)
    }

    @Post('items')
    @UsePipes(new ZodValidationPipe(addItemSchema))
    async addItem(
        @requestWithUser() user: User,
        @Body() addItemDto: AddItemDto
    ) {
        return 'Ok'
    }
}
