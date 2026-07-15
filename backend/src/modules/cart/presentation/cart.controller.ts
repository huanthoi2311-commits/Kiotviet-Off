import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  ApiCommonErrors,
  ApiWriteErrors,
} from '../../../common/swagger/api-common-errors.decorator';
import type { JwtAccessPayload } from '../../../common/types/jwt-payload.type';
import { JwtAuthGuard } from '../../auth/presentation/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/presentation/permissions.guard';
import { RequirePermissions } from '../../rbac/presentation/permissions.decorator';
import { ActorContext, CartService } from '../application/cart.service';
import { AddCartItemDto } from '../application/dto/add-cart-item.dto';
import { CartResponseDto } from '../application/dto/cart-response.dto';
import { RemoveCartItemDto } from '../application/dto/remove-cart-item.dto';
import { UpdateCartItemDto } from '../application/dto/update-cart-item.dto';

/**
 * Không có "Permission" riêng trong Prompt 033 — dùng chung `pos:access` đã seed sẵn từ
 * Foundation (Cart là một phần của màn hình bán hàng POS), không thêm permission mới.
 */
@ApiTags('Cart')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('pos:access')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy giỏ hàng hiện tại của user đang đăng nhập' })
  @ApiResponse({ status: 200, type: CartResponseDto })
  getCart(@CurrentUser() user: JwtAccessPayload): Promise<CartResponseDto> {
    return this.cartService.getCart(this.toActor(user));
  }

  @Post('add')
  @ApiOperation({
    summary: 'Thêm sản phẩm vào giỏ — cộng dồn nếu sản phẩm đã có sẵn',
  })
  @ApiResponse({ status: 201, type: CartResponseDto })
  @ApiWriteErrors()
  add(
    @Body() dto: AddCartItemDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<CartResponseDto> {
    return this.cartService.addItem(dto, this.toActor(user));
  }

  @Patch('update')
  @ApiOperation({ summary: 'Sửa số lượng tuyệt đối của 1 dòng trong giỏ' })
  @ApiResponse({ status: 200, type: CartResponseDto })
  @ApiWriteErrors()
  update(
    @Body() dto: UpdateCartItemDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<CartResponseDto> {
    return this.cartService.updateItem(dto, this.toActor(user));
  }

  @Delete('remove')
  @ApiOperation({ summary: 'Xóa 1 sản phẩm khỏi giỏ hàng' })
  @ApiResponse({ status: 200, type: CartResponseDto })
  @ApiWriteErrors()
  remove(
    @Body() dto: RemoveCartItemDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<CartResponseDto> {
    return this.cartService.removeItem(dto, this.toActor(user));
  }

  @Post('clear')
  @ApiOperation({ summary: 'Xóa toàn bộ giỏ hàng' })
  @ApiResponse({ status: 201, type: CartResponseDto })
  clear(@CurrentUser() user: JwtAccessPayload): Promise<CartResponseDto> {
    return this.cartService.clear(this.toActor(user));
  }

  private toActor(user: JwtAccessPayload): ActorContext {
    return { userId: user.sub, organizationId: user.organizationId };
  }
}
