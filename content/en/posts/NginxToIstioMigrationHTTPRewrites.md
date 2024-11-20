+++
title = 'Migration from Nginx to Istio: HTTP Rewrites'
date = 2024-11-20T17:05:55-05:00
draft = false
+++

I am going through the process of migrating from [NGINX Ingress](https://github.com/kubernetes/ingress-nginx) to [Istio](https://istio.io/latest/) in our development Kubernetes cluster. My organization wants to start taking advantage of service mesh capabilities and progressive deployments with [Flagger](https://flagger.app/).

We experienced one growing pain that I thought was worth documenting. A developer wrote an update to one of our microservices that introduced a new endpoint accepting a POST request. Testing in our staging environment had the endpoint working as expected. However, in our development environment where Istio is deployed, they were unable to hit the endpoint correctly, receiving a 404 error in Postman. This was unexpected.

After hearing about this, I used k9s to monitor logs for the deployment. I opened Postman and hit the new endpoint with a POST request. Interestingly enough, the deployment logged a GET request. That was not the expected outcome.

After some troubleshooting that didn't lead anywhere, I tried setting my endpoint in Postman to use HTTPS. The request worked as expected and showed up as a POST request in the microservice! But why?

Doing some research I quickly found out the rationale behind this behavior. When rewriting http requests Nginx-Ingress and Istio take different approaches. Nginx-Ingress will post a 301 (Moved Permanently) HTTP status code. The POST request is unchanged while being rewritten as an HTTPS request, and sent along to the system. 

Istio on the other hand posts a 307 (Permanent Redirect) HTTP status code. As part of the HTTP/1.1 specification, the POST request gets rewritten to a GET request. The reason being is that it is a safer approach. 

The fix here is simply using https when hitting our API.

More information about 3xx rewrites and rational can be found [here](https://www.rfc-editor.org/rfc/rfc9110.html#name-redirection-3xx).
