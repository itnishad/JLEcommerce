import { Module } from '@nestjs/common';
import { ProductRepository } from './product.repository';

@Module({
  providers: [ProductRepository],
  exports: [ProductRepository]
})
export class ProductModule {}
