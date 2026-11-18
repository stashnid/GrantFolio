.PHONY: mono-webhook payments unlock logs
mono-webhook:
	@python3 scripts/monobank-jar.py connect
payments:
	@python3 scripts/monobank-jar.py payments
unlock:
	@CODE="$(CODE)" python3 scripts/monobank-jar.py unlock
logs:
	@gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="grantfolio-web" AND jsonPayload.event="jar_payment"' --project=grantfolio-pp-ua --limit=50 --format=json
