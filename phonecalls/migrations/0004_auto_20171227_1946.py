# -*- coding: utf-8 -*-
# Generated by Django 1.11.5 on 2017-12-28 03:46
from __future__ import unicode_literals

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('phonecalls', '0003_userapp'),
    ]

    operations = [
        migrations.RenameModel(
            old_name='PhoneNumbers',
            new_name='PhoneNumber',
        ),
    ]
