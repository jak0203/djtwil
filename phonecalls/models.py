from django.contrib.auth.models import User
from django.db import models


class PhoneNumber(models.Model):
    def __str__(self):
        return f'Phone Number: {self.number}'
    number = models.CharField(max_length=15)
    description = models.CharField(default='None', max_length=60)
    primary = models.BooleanField(default=False)


class UserApp(models.Model):
    def __str__(self):
        return f'User: {self.user.username}, App: {self.app}'
    user = models.ForeignKey(User)
    app = models.CharField(max_length=60)
    is_online = models.BooleanField(default=False)

# class PhoneCallHistory(models.Model):
