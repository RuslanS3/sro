/**
 * Re-export the shared contract types so internal modules can import from a
 * neighbouring `./dph-registration.types` file (matches the dppo convention),
 * without duplicating type definitions.
 */
export type {
  DphRegistrationData,
  DphRegistrationPayload,
  DphBankAccount,
  DphEuRegistrationRow,
  DphSignatureBlock,
  DphProtocolError,
  GenerateDphRegistrationOptions,
  GenerateDphRegistrationResult,
  RegistrationMode,
  SubjectType
} from '../../../shared/dph-registration.contracts';
