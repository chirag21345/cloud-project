FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV MONITOR_INTERVAL=60
EXPOSE 8070
CMD ["python", "monitor.py"]
