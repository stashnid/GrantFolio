-- NULL identifies exchanges created before profile freshness was tracked.
ALTER TABLE assistant_exchanges ADD COLUMN profile_revision INTEGER;
