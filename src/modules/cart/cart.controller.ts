import { Controller, Get } from '@nestjs/common';
import { CartService } from './cart.service';

@Controller('cart')
export class CartController {
    constructor(private readonly cartService: CartService){}

    @Get()
    async getActiveCart(){
        try {
            return this.cartService.userab()
        } catch (error) {
            console.log(error)
        }
    }
}
