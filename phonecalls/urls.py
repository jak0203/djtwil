from django.conf.urls import url
from django.contrib.auth.decorators import login_required

from . import views

app_name = 'phonecalls'
urlpatterns = [
    url(r'^token', views.access_token, name='token'),
    # url(r'^token', views.token, name='token'),
    url(r'^incoming', views.incoming, name='incoming'),
    url(r'^outgoing', views.outgoing, name='outgoing'),
    url(r'^voice', views.voice, name='voice'),
]