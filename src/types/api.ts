export type ApiListResponse<T> = {
  total: number;
  data: T[];
};

export type ApiErrorResponse = {
  error: true;
  statusCode: number;
  message: string;
};
