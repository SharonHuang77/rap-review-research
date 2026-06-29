import { DomainError } from "../shared/errors.ts";

/**
 * Typed errors raised by the LLM layer.
 *
 * Review architectures should propagate these without attempting recovery; the
 * Experiment Engine decides whether a retry occurs.
 */

/** Credentials are missing, invalid, or lack permission for the model. */
export class ProviderAuthenticationError extends DomainError {
  public readonly code = "PROVIDER_AUTH_ERROR";
}

/** The provider request timed out. */
export class ProviderTimeoutError extends DomainError {
  public readonly code = "PROVIDER_TIMEOUT";
}

/** The provider throttled or rate-limited the request. */
export class ProviderRateLimitError extends DomainError {
  public readonly code = "PROVIDER_RATE_LIMIT";
}

/** The provider returned an error or an unusable response. */
export class ProviderResponseError extends DomainError {
  public readonly code = "PROVIDER_RESPONSE_ERROR";
}

/** A requested prompt template could not be found. */
export class PromptNotFoundError extends DomainError {
  public readonly code = "PROMPT_NOT_FOUND";
}
