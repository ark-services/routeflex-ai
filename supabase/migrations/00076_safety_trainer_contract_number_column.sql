-- contract_number is now supplied per-applicant via a board column mapping
-- (contract_number_column_id in the automation action config).
-- Make the company-level column nullable so existing rows are not broken.
-- The app no longer reads or writes this column.
ALTER TABLE safety_trainer_connections
  ALTER COLUMN contract_number DROP NOT NULL,
  ALTER COLUMN contract_number SET DEFAULT '';
