FROM public.ecr.aws/lambda/python:3.12
RUN pip install --no-cache-dir requests beautifulsoup4 playwright 'boto3>=1.36'
COPY scraper ${LAMBDA_TASK_ROOT}/scraper
COPY ops ${LAMBDA_TASK_ROOT}/ops
CMD ["ops.stirling_worker.handler"]
