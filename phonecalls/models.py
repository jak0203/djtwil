from django.db import models


class PhoneNumbers(models.Model):
    number = models.CharField(max_length=15)
    description = models.CharField(default='None', max_length=60)
    primary = models.BooleanField(default=False)
