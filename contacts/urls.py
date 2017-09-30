from django.conf.urls import url
from django.contrib.auth.decorators import login_required

from . import views

app_name = 'contacts'
urlpatterns = [
    # url(r'^$', views.index),
    url(r'^$', views.listView.as_view(), name='contactlist'),
    url(r'^contacts', views.contacts, name='contacts'),
]