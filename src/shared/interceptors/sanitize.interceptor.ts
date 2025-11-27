import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class SanitizeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Sanitize request body (mutable)
    if (request.body) {
      request.body = this.sanitizeObject(request.body);
    }

    // Sanitize query parameters (read-only, so we sanitize in-place)
    if (request.query && typeof request.query === 'object') {
      Object.keys(request.query).forEach((key) => {
        const sanitized = this.sanitizeObject(request.query[key]);
        if (sanitized !== request.query[key]) {
          delete request.query[key];
          request.query[key] = sanitized;
        }
      });
    }

    // Sanitize URL parameters (read-only, so we sanitize in-place)
    if (request.params && typeof request.params === 'object') {
      Object.keys(request.params).forEach((key) => {
        const sanitized = this.sanitizeObject(request.params[key]);
        if (sanitized !== request.params[key]) {
          delete request.params[key];
          request.params[key] = sanitized;
        }
      });
    }

    // Sanitize response data
    return next.handle().pipe(map((data) => this.sanitizeResponse(data)));
  }

  private sanitizeObject(obj: any): any {
    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    if (obj !== null && typeof obj === 'object') {
      const source = typeof obj.toObject === 'function' ? obj.toObject() : obj;
      const sanitized: any = {};
      for (const key of Object.keys(source)) {
        sanitized[key] = this.sanitizeObject(source[key]);
      }
      return sanitized;
    }

    return obj;
  }

  private sanitizeString(str: string): string {
    return str
      .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
      .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '') // Remove iframe tags
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove inline event handlers
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/vbscript:/gi, '') // Remove vbscript: protocol
      .replace(/data:text\/html/gi, '') // Remove data:text/html
      .trim();
  }

  private sanitizeResponse(data: any): any {
    // Remove sensitive fields from response
    if (data && typeof data === 'object') {
      if (Array.isArray(data)) {
        return data.map((item) => this.removeSensitiveFields(item));
      }
      return this.removeSensitiveFields(data);
    }
    return data;
  }

  private removeSensitiveFields(
    obj: any,
    visited = new WeakSet<object>(),
    depth = 0,
  ): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (visited.has(obj as object)) {
      return undefined;
    }
    visited.add(obj as object);

    if (depth > 10) {
      return undefined;
    }

    const source = typeof obj.toObject === 'function' ? obj.toObject() : obj;

    const sensitiveFields = [
      'password',
      'passwordHash',
      'salt',
      'securityToken',
      'resetToken',
      'verificationToken',
      '__v',
    ];

    if (Array.isArray(source)) {
      return source.map((item) =>
        this.removeSensitiveFields(item, visited, depth + 1),
      );
    }

    const cleaned: any = {};
    for (const key of Object.keys(source)) {
      if (sensitiveFields.includes(key)) {
        continue;
      }
      const value = source[key];
      if (value && typeof value === 'object') {
        cleaned[key] = this.removeSensitiveFields(value, visited, depth + 1);
      } else {
        cleaned[key] = value;
      }
    }

    return cleaned;
  }
}
