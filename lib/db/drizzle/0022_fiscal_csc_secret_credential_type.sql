ALTER TABLE "fiscal_provider_credentials" DROP CONSTRAINT IF EXISTS "fiscal_provider_credentials_type_check";
ALTER TABLE "fiscal_provider_credentials"
  ADD CONSTRAINT "fiscal_provider_credentials_type_check"
  CHECK ("credential_type" IN ('api_token', 'csc_secret'));
