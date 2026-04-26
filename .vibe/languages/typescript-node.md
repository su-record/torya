# TypeScript + Node.js Backend Quality Rules

## Core Principles (inherited from core)

```markdown
# Core Principles (inherited from core)
Single Responsibility (SRP)
No Duplication (DRY)
Reusability
Low Complexity
Function <= 30 lines
Nesting <= 3 levels
Cyclomatic complexity <= 10
```

## Express.js Rules

### 1. Structured Routers

```typescript
// Good: routes/user.routes.ts
import { Router } from 'express';
import { UserController } from '@/controllers/user.controller';
import { authMiddleware } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { createUserSchema, updateUserSchema } from '@/schemas/user.schema';

const router = Router();
const controller = new UserController();

router.get('/', controller.findAll);
router.get('/:id', controller.findOne);
router.post('/', validate(createUserSchema), controller.create);
router.put('/:id', authMiddleware, validate(updateUserSchema), controller.update);
router.delete('/:id', authMiddleware, controller.delete);

export default router;
```

### 2. Controller Pattern

```typescript
// Good: controllers/user.controller.ts
import { Request, Response, NextFunction } from 'express';
import { UserService } from '@/services/user.service';
import { CreateUserDto, UpdateUserDto } from '@/dto/user.dto';

export class UserController {
  private userService = new UserService();

  findAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      const users = await this.userService.findAll({
        page: Number(page),
        limit: Number(limit),
      });
      res.json(users);
    } catch (error) {
      next(error);
    }
  };

  findOne = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await this.userService.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json(user);
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto: CreateUserDto = req.body;
      const user = await this.userService.create(dto);
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  };
}
```

### 3. Service Layer

```typescript
// Good: services/user.service.ts
import { prisma } from '@/lib/prisma';
import { CreateUserDto, UpdateUserDto } from '@/dto/user.dto';
import { hashPassword } from '@/utils/crypto';
import { AppError } from '@/utils/errors';

export class UserService {
  async findAll(options: { page: number; limit: number }) {
    const { page, limit } = options;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({ skip, take: limit }),
      prisma.user.count(),
    ]);

    return {
      data: users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  }

  async create(dto: CreateUserDto) {
    const existing = await prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new AppError('Email already exists', 409);
    }

    const hashedPassword = await hashPassword(dto.password);

    return prisma.user.create({
      data: {
        ...dto,
        password: hashedPassword,
      },
    });
  }
}
```

## NestJS Rules

### 1. Module Structure

```typescript
// Good: user/user.module.ts
import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';

@Module({
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService],
})
export class UserModule {}
```

### 2. Controller (NestJS)

```typescript
// Good: user/user.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto, UpdateUserDto, UserQueryDto } from './dto';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: 'Get user list' })
  async findAll(@Query() query: UserQueryDto) {
    return this.userService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user detail' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.userService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create user' })
  async create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: User,
  ) {
    return this.userService.update(id, dto, user);
  }
}
```

### 3. Service (NestJS)

```typescript
// Good: user/user.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { CreateUserDto, UpdateUserDto } from './dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async findAll(query: UserQueryDto) {
    return this.userRepository.findAll(query);
  }

  async findById(id: number) {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async create(dto: CreateUserDto) {
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    return this.userRepository.create({
      ...dto,
      password: hashedPassword,
    });
  }
}
```

### 4. DTO and Validation

```typescript
// Good: user/dto/create-user.dto.ts
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: '010-1234-5678' })
  @IsOptional()
  @IsString()
  phone?: string;
}
```

## Common Rules

### Error Handling

```typescript
// Good: utils/errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Good: middleware/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '@/utils/errors';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  console.error(err);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
    });
  }

  res.status(500).json({
    success: false,
    message: 'Server error occurred',
  });
}
```

### Validation (Zod)

```typescript
// Good: schemas/user.schema.ts
import { z } from 'zod';

export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1, 'Name is required'),
    phone: z.string().optional(),
  }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>['body'];
```

## File Structure

```text
src/
├── controllers/        # Route handlers
├── services/           # Business logic
├── repositories/       # Data access
├── dto/                # Data Transfer Objects
├── schemas/            # Validation schemas (Zod)
├── middleware/         # Express middleware
├── routes/             # Router definitions
├── utils/              # Utilities
├── types/              # TypeScript types
├── config/             # Configuration
└── lib/                # External library wrappers
```

## Checklist

- [ ] Controller -> Service -> Repository layer separation
- [ ] Define input/output types with DTO
- [ ] Validate input with Zod/class-validator
- [ ] Use custom error class
- [ ] Centralize error handling with error middleware
- [ ] No `any` type usage
- [ ] async/await + try/catch or error middleware
