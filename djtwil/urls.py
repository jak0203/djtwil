from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.contrib.auth.decorators import login_required
from django.conf.urls import url, include

from rest_framework import routers
from rest_framework.authtoken import views as rest_views

from . import views
from contacts import views as contact_views


# Rest API routes
router = routers.DefaultRouter()
router.register(r'users', views.UserViewSet)
router.register(r'groups', views.GroupViewSet)
router.register(r'contacts', contact_views.PersonViewSet)


urlpatterns = [
    url(r'^admin/', admin.site.urls),
    url(r'^login/', auth_views.login, name='login'),
    url(r'^logout/$', auth_views.logout, name='logout'),

    url(r'^api/', include(router.urls)),
    url(r'^api/token/', rest_views.obtain_auth_token),

    url(r'^phonecalls/', include('phonecalls.urls')),
    url(r'^webapp/', login_required(views.ReactAppView.as_view(), login_url='/admin/login')),

]
