from django.conf.urls import url

from . import views

app_name = 'phonecalls'
urlpatterns = [
    url(r'^$', views.index),
    url(r'^accessToken', views.access_token, name='accessToken'),
    url(r'^token', views.token, name='token'),
    url(r'^incoming', views.incoming, name='incoming'),
    url(r'^outgoing', views.outgoing, name='outgoing'),
    url(r'^voice', views.voice, name='voice'),
]