from django.conf.urls import url

from . import views

app_name = 'contacts'
urlpatterns = [
    url(r'^$', views.ContactListView.as_view(), name='contactlist'),
    url(r'^contacts', views.contacts, name='contacts'),
]
