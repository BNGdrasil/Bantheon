// API response type
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// common error type
export interface AppError {
  code: string;
  message: string;
  details?: any;
}
