UPDATE grant_preparation_pilot
  SET amount_kopecks = 500
  WHERE amount_kopecks IS NOT NULL AND amount_kopecks <> 500;

ALTER TABLE grant_preparation_pilot
  ADD CONSTRAINT grant_preparation_pilot_fixed_price
  CHECK (amount_kopecks IS NULL OR amount_kopecks = 500);
