import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

describe('ProductsController (catalog)', () => {
  let controller: ProductsController;
  const productsService = {
    getProducts: vi.fn(),
    findProductById: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: productsService }],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it('getProducts delegates to the service', async () => {
    const products = [{ id: 1 }];
    productsService.getProducts.mockResolvedValue(products);

    await expect(controller.getProducts()).resolves.toEqual(products);
    expect(productsService.getProducts).toHaveBeenCalledTimes(1);
  });

  it('findByProductId passes category slug and product id', async () => {
    const product = { product_id: 'royal-rasamalai' };
    productsService.findProductById.mockResolvedValue(product);

    await expect(
      controller.findByProductId('desserts', 'royal-rasamalai'),
    ).resolves.toEqual(product);
    expect(productsService.findProductById).toHaveBeenCalledWith(
      'desserts',
      'royal-rasamalai',
    );
  });
});
