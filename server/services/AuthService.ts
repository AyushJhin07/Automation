import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq, and } from 'drizzle-orm';
import { users, sessions } from '../database/schema';
import { EncryptionService } from './EncryptionService';

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name?: string;
    role: string;
    planType: string;
    quotaApiCalls: number;
    quotaTokens: number;
  };
  token?: string;
  refreshToken?: string;
  expiresAt?: Date;
  error?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  planType: string;
  isActive: boolean;
  emailVerified: boolean;
  monthlyApiCalls: number;
  monthlyTokensUsed: number;
  quotaApiCalls: number;
  quotaTokens: number;
  createdAt: Date;
}

export class AuthService {
  private db: any;

  constructor() {
    const sql = neon(process.env.DATABASE_URL!);
    this.db = drizzle(sql);
  }

  /**
   * Register a new user
   */
  public async register(request: RegisterRequest): Promise<AuthResponse> {
    try {
      console.log(`👤 Registering user: ${request.email}`);

      // Validate email format
      if (!this.isValidEmail(request.email)) {
        return {
          success: false,
          error: 'Invalid email format'
        };
      }

      // Validate password strength
      const passwordValidation = this.validatePassword(request.password);
      if (!passwordValidation.valid) {
        return {
          success: false,
          error: passwordValidation.error
        };
      }

      // Check if user already exists
      const existingUser = await this.getUserByEmail(request.email);
      if (existingUser) {
        return {
          success: false,
          error: 'User already exists with this email'
        };
      }

      // Hash password
      const passwordHash = await EncryptionService.hashPassword(request.password);

      // Create user
      const [newUser] = await this.db.insert(users).values({
        email: request.email.toLowerCase(),
        passwordHash,
        name: request.name,
        role: 'user',
        planType: 'free',
        isActive: true,
        emailVerified: false,
        monthlyApiCalls: 0,
        monthlyTokensUsed: 0,
        quotaApiCalls: 1000, // Free tier
        quotaTokens: 100000, // Free tier
      }).returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        planType: users.planType,
        quotaApiCalls: users.quotaApiCalls,
        quotaTokens: users.quotaTokens,
      });

      // Generate tokens
      const { token, refreshToken, expiresAt } = await this.generateTokens(newUser.id);

      console.log(`✅ User registered successfully: ${newUser.id}`);

      return {
        success: true,
        user: newUser,
        token,
        refreshToken,
        expiresAt
      };

    } catch (error) {
      console.error('❌ Registration error:', error);
      return {
        success: false,
        error: 'Registration failed. Please try again.'
      };
    }
  }

  /**
   * Login user
   */
  public async login(request: LoginRequest): Promise<AuthResponse> {
    try {
      console.log(`🔑 Login attempt: ${request.email}`);

      // Get user by email
      const user = await this.getUserByEmail(request.email);
      if (!user) {
        return {
          success: false,
          error: 'Invalid email or password'
        };
      }

      // Check if user is active
      if (!user.isActive) {
        return {
          success: false,
          error: 'Account is deactivated. Please contact support.'
        };
      }

      // Verify password
      const isValidPassword = await EncryptionService.verifyPassword(
        request.password,
        user.passwordHash
      );

      if (!isValidPassword) {
        return {
          success: false,
          error: 'Invalid email or password'
        };
      }

      // Update last login
      await this.updateLastLogin(user.id);

      // Generate tokens
      const { token, refreshToken, expiresAt } = await this.generateTokens(user.id);

      console.log(`✅ Login successful: ${user.id}`);

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          planType: user.planType,
          quotaApiCalls: user.quotaApiCalls,
          quotaTokens: user.quotaTokens,
        },
        token,
        refreshToken,
        expiresAt
      };

    } catch (error) {
      console.error('❌ Login error:', error);
      return {
        success: false,
        error: 'Login failed. Please try again.'
      };
    }
  }

  /**
   * Refresh access token
   */
  public async refreshToken(refreshToken: string): Promise<AuthResponse> {
    try {
      // Find session with refresh token
      const [session] = await this.db
        .select({
          userId: sessions.userId,
          expiresAt: sessions.expiresAt,
          isActive: sessions.isActive,
        })
        .from(sessions)
        .where(and(
          eq(sessions.refreshToken, refreshToken),
          eq(sessions.isActive, true)
        ));

      if (!session) {
        return {
          success: false,
          error: 'Invalid refresh token'
        };
      }

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        await this.invalidateSession(refreshToken);
        return {
          success: false,
          error: 'Refresh token expired'
        };
      }

      // Get user
      const user = await this.getUserById(session.userId);
      if (!user || !user.isActive) {
        return {
          success: false,
          error: 'User not found or inactive'
        };
      }

      // Generate new tokens
      const tokens = await this.generateTokens(user.id);

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          planType: user.planType,
          quotaApiCalls: user.quotaApiCalls,
          quotaTokens: user.quotaTokens,
        },
        token: tokens.token,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt
      };

    } catch (error) {
      console.error('❌ Token refresh error:', error);
      return {
        success: false,
        error: 'Token refresh failed'
      };
    }
  }

  /**
   * Logout user (invalidate session)
   */
  public async logout(token: string): Promise<boolean> {
    try {
      await this.invalidateSession(token);
      return true;
    } catch (error) {
      console.error('❌ Logout error:', error);
      return false;
    }
  }

  /**
   * Verify JWT token and get user
   */
  public async verifyToken(token: string): Promise<AuthUser | null> {
    try {
      // Verify JWT
      const payload = EncryptionService.verifyJWT(token);
      
      // Check if session is active
      const [session] = await this.db
        .select()
        .from(sessions)
        .where(and(
          eq(sessions.token, token),
          eq(sessions.isActive, true)
        ));

      if (!session) {
        return null;
      }

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        await this.invalidateSession(token);
        return null;
      }

      // Get user
      const user = await this.getUserById(payload.userId);
      if (!user || !user.isActive) {
        return null;
      }

      // Update last used
      await this.updateSessionLastUsed(token);

      return user;

    } catch (error) {
      console.error('❌ Token verification error:', error);
      return null;
    }
  }

  /**
   * Get user by email
   */
  private async getUserByEmail(email: string): Promise<any> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()));

    return user;
  }

  /**
   * Get user by ID
   */
  private async getUserById(userId: string): Promise<AuthUser | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    return user;
  }

  /**
   * Generate JWT and refresh tokens
   */
  private async generateTokens(userId: string): Promise<{
    token: string;
    refreshToken: string;
    expiresAt: Date;
  }> {
    const token = EncryptionService.generateJWT({ userId }, '24h');
    const refreshToken = EncryptionService.generateRefreshToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Store session
    await this.db.insert(sessions).values({
      userId,
      token,
      refreshToken,
      expiresAt,
      isActive: true,
    });

    return { token, refreshToken, expiresAt };
  }

  /**
   * Update last login timestamp
   */
  private async updateLastLogin(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  /**
   * Invalidate session
   */
  private async invalidateSession(token: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({
        isActive: false,
      })
      .where(eq(sessions.token, token));
  }

  /**
   * Update session last used timestamp
   */
  private async updateSessionLastUsed(token: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({
        lastUsedAt: new Date(),
      })
      .where(eq(sessions.token, token));
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate password strength
   */
  private validatePassword(password: string): { valid: boolean; error?: string } {
    if (password.length < 8) {
      return { valid: false, error: 'Password must be at least 8 characters long' };
    }

    if (!/(?=.*[a-z])/.test(password)) {
      return { valid: false, error: 'Password must contain at least one lowercase letter' };
    }

    if (!/(?=.*[A-Z])/.test(password)) {
      return { valid: false, error: 'Password must contain at least one uppercase letter' };
    }

    if (!/(?=.*\d)/.test(password)) {
      return { valid: false, error: 'Password must contain at least one number' };
    }

    return { valid: true };
  }

  /**
   * Check if user has quota remaining
   */
  public async checkQuota(userId: string, apiCalls: number = 1, tokens: number = 0): Promise<{
    hasQuota: boolean;
    quotaExceeded: 'api_calls' | 'tokens' | null;
  }> {
    const user = await this.getUserById(userId);
    if (!user) {
      return { hasQuota: false, quotaExceeded: null };
    }

    if (user.monthlyApiCalls + apiCalls > user.quotaApiCalls) {
      return { hasQuota: false, quotaExceeded: 'api_calls' };
    }

    if (user.monthlyTokensUsed + tokens > user.quotaTokens) {
      return { hasQuota: false, quotaExceeded: 'tokens' };
    }

    return { hasQuota: true, quotaExceeded: null };
  }

  /**
   * Update usage metrics
   */
  public async updateUsage(userId: string, apiCalls: number = 0, tokens: number = 0): Promise<void> {
    await this.db
      .update(users)
      .set({
        monthlyApiCalls: users.monthlyApiCalls + apiCalls,
        monthlyTokensUsed: users.monthlyTokensUsed + tokens,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }
}

export const authService = new AuthService();