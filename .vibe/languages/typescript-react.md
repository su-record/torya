# TypeScript + React Quality Rules

## Core Principles (inherited from core)

```markdown
# Core Principles (inherited from core)
Single Responsibility (SRP)
No Duplication (DRY)
Reusability
Low Complexity
Function <= 30 lines, JSX <= 50 lines
Nesting <= 3 levels
Cyclomatic complexity <= 10
```

## TypeScript/React Specific Rules

### 1. 100% Type Safety

```typescript
// Bad: Using any
function processData(data: any) {
  return data.value;
}

// Good: Clear type definition
interface User {
  id: string;
  name: string;
  email: string;
  age: number;
}

function processUser(user: User): string {
  return user.name;
}

// Good: Generic usage
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

type UserResponse = ApiResponse<User>;
type ProductResponse = ApiResponse<Product>;
```

### 2. Functional Components + Hooks

```typescript
// Good: Functional component (recommended)
interface UserCardProps {
  user: User;
  onEdit?: (user: User) => void;
}

export function UserCard({ user, onEdit }: UserCardProps) {
  const [isEditing, setIsEditing] = useState(false);

  const handleEdit = useCallback(() => {
    if (onEdit) {
      onEdit(user);
    }
  }, [user, onEdit]);

  return (
    <div>
      <h2>{user.name}</h2>
      <button onClick={handleEdit}>Edit</button>
    </div>
  );
}

// Bad: Class component (legacy)
class UserCard extends React.Component<UserCardProps> {
  // Complex and verbose
}
```

### 3. Separate Logic with Custom Hooks

```typescript
// Good: Custom Hook (reusable logic)
interface UseUserOptions {
  userId: string;
}

interface UseUserReturn {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

function useUser({ userId }: UseUserOptions): UseUserReturn {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/users/${userId}`);
      const data = await response.json();
      setUser(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return { user, isLoading, error, refetch: fetchUser };
}

// Usage
function UserProfile({ userId }: { userId: string }) {
  const { user, isLoading, error } = useUser({ userId });

  if (isLoading) return <Spinner />;
  if (error) return <Error message={error} />;
  if (!user) return <NotFound />;

  return <UserCard user={user} />;
}
```

### 4. Props Type Definition

```typescript
// Good: Clear Props types
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
  children,
}: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant} btn-${size}`}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

// Good: Using PropsWithChildren
import { PropsWithChildren } from 'react';

interface CardProps {
  title: string;
  subtitle?: string;
}

export function Card({
  title,
  subtitle,
  children,
}: PropsWithChildren<CardProps>) {
  return (
    <div>
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
      {children}
    </div>
  );
}
```

### 5. React Query (Server State Management)

```typescript
// Good: Server state management with React Query
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function useUser(userId: string) {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateUserData) => updateUser(data),
    onSuccess: (updatedUser) => {
      // Update cache
      queryClient.setQueryData(['user', updatedUser.id], updatedUser);
    },
  });
}

// Usage
function UserProfile({ userId }: { userId: string }) {
  const { data: user, isLoading, error } = useUser(userId);
  const updateMutation = useUpdateUser();

  if (isLoading) return <Spinner />;
  if (error) return <Error />;

  return (
    <div>
      <h1>{user.name}</h1>
      <button
        onClick={() => updateMutation.mutate({ id: userId, name: 'New Name' })}
        disabled={updateMutation.isPending}
      >
        Update
      </button>
    </div>
  );
}
```

### 6. Define Contract with Zod

```typescript
// Good: Zod schema (runtime + type validation)
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  age: z.number().min(0).max(150),
});

type CreateUserRequest = z.infer<typeof createUserSchema>;

// Usage (React Hook Form)
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

function SignUpForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserRequest>({
    resolver: zodResolver(createUserSchema),
  });

  const onSubmit = async (data: CreateUserRequest) => {
    await registerUser(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}

      <input {...register('username')} />
      {errors.username && <span>{errors.username.message}</span>}

      <input type="password" {...register('password')} />
      {errors.password && <span>{errors.password.message}</span>}

      <input type="number" {...register('age', { valueAsNumber: true })} />
      {errors.age && <span>{errors.age.message}</span>}

      <button type="submit" disabled={isSubmitting}>
        Sign Up
      </button>
    </form>
  );
}
```

### 7. Component Separation (Extract Component)

```typescript
// Bad: Long JSX (80 lines)
function UserDashboard() {
  return (
    <div>
      <header>
        <h1>Dashboard</h1>
        {/* 20 lines */}
      </header>
      <main>
        {/* 40 lines */}
      </main>
      <footer>
        {/* 20 lines */}
      </footer>
    </div>
  );
}

// Good: Separate into sub-components
function UserDashboard() {
  return (
    <div>
      <DashboardHeader />
      <DashboardMain />
      <DashboardFooter />
    </div>
  );
}

function DashboardHeader() {
  return <header>{/* ... */}</header>;
}

function DashboardMain() {
  return <main>{/* ... */}</main>;
}

function DashboardFooter() {
  return <footer>{/* ... */}</footer>;
}
```

### 8. useCallback + useMemo Optimization

```typescript
// Good: useCallback (function memoization)
function Parent() {
  const [count, setCount] = useState(0);

  // Prevent creating new function every render
  const handleClick = useCallback(() => {
    setCount(prev => prev + 1);
  }, []);

  return <Child onClick={handleClick} />;
}

const Child = React.memo<{ onClick: () => void }>(({ onClick }) => {
  return <button onClick={onClick}>Click</button>;
});

// Good: useMemo (value memoization)
function ExpensiveComponent({ data }: { data: number[] }) {
  const processedData = useMemo(() => {
    return data
      .map(expensiveCalculation)
      .filter(x => x > 0)
      .reduce((a, b) => a + b, 0);
  }, [data]);

  return <div>{processedData}</div>;
}
```

### 9. Error Boundary

```typescript
// Good: Error Boundary (class component required)
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <ErrorFallback error={this.state.error} />;
    }

    return this.props.children;
  }
}

// Usage
function App() {
  return (
    <ErrorBoundary fallback={<ErrorPage />}>
      <UserDashboard />
    </ErrorBoundary>
  );
}
```

### 10. Type Guards

```typescript
// Good: Type guards
interface Dog {
  type: 'dog';
  bark: () => void;
}

interface Cat {
  type: 'cat';
  meow: () => void;
}

type Animal = Dog | Cat;

function isDog(animal: Animal): animal is Dog {
  return animal.type === 'dog';
}

function makeSound(animal: Animal) {
  if (isDog(animal)) {
    animal.bark();  // Type safe
  } else {
    animal.meow();  // Type safe
  }
}

// Good: Discriminated Union
function AnimalCard({ animal }: { animal: Animal }) {
  switch (animal.type) {
    case 'dog':
      return <DogCard dog={animal} />;
    case 'cat':
      return <CatCard cat={animal} />;
  }
}
```

## Anti-patterns

```typescript
// Bad: Props drilling (3+ levels)
<GrandParent user={user}>
  <Parent user={user}>
    <Child user={user} />
  </Parent>
</GrandParent>

// Good: Use Context
const UserContext = createContext<User | undefined>(undefined);

<UserContext.Provider value={user}>
  <GrandParent />
</UserContext.Provider>

// Bad: Missing useEffect dependency
useEffect(() => {
  fetchUser(userId);
}, []); // userId dependency missing!

// Good: Specify all dependencies
useEffect(() => {
  fetchUser(userId);
}, [userId]);

// Bad: Inline objects/functions (cause re-renders)
<Child config={{ theme: 'dark' }} onClick={() => {}} />

// Good: useMemo/useCallback
const config = useMemo(() => ({ theme: 'dark' }), []);
const handleClick = useCallback(() => {}, []);
<Child config={config} onClick={handleClick} />
```

## Code Quality Tools

```bash
# TypeScript compile
tsc --noEmit

# ESLint
eslint src/ --ext .ts,.tsx

# Prettier
prettier --write src/

# Testing
vitest
# or
jest
```

## Checklist

When writing TypeScript/React code:

- [ ] 100% type safety (no any)
- [ ] Functional components + Hooks
- [ ] Separate logic with Custom Hook
- [ ] Clear Props type definition
- [ ] Server state with React Query
- [ ] Define Contract with Zod
- [ ] JSX <= 50 lines (component separation)
- [ ] useCallback/useMemo optimization
- [ ] Use Error Boundary
- [ ] Use type guards
- [ ] Complexity <= 10
