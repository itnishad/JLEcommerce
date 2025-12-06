import { Controller, Get, UseGuards } from '@nestjs/common';
import { CartService } from './cart.service';
import { AuthGuard } from '@nestjs/passport';
import { requestWithUser } from '../../decorators/user.decorator';
import {type User} from '../../../generated/prisma/client'

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
}
