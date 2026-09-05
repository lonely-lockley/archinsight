# Deployment Projections

Read this reference when a task involves a physical path, an infrastructure
projection, or a missing or unexpected edge in Deployment. Read
`references/deployment.md` first for environments, inventory, profiles, and
placement.

## Execution model

Projection rules live on concrete infrastructure instances. An element
projection receives `$from` for the deployed logical element and has no
`$to`. A wire projection receives both logical endpoints. `$this` is the
concrete projection owner, while a plain identifier resolves one of its typed
attributes.

Every rule describes one independent directed physical edge. The term on the
left is always the physical source and the term on the right is always the
physical target. Repeating an endpoint joins rules into a path; reusing one
endpoint in several rules creates fan-out.

The leading `source` and `target` placement words assign a term to the
logical source or target side for ownership and source scoping. Placement does
not reverse the physical left-to-right direction.

Use `originalLink` on the hop that must retain the authored logical operator,
`model`, `via`, `technology`, `description`, annotations, and other
relationship attributes. A `connectTo` rule creates a new physical edge and
receives only attributes written on that rule, while projection origin metadata
still provides traceability. A path made entirely from `connectTo` therefore
does not carry the logical operator or authored relationship attributes.

Wire `uses` accepts only a `NetworkConnection` descendant. The built-in
`Broker` is one and can fill a wire-facing environment slot directly. Derive
product-specific broker types from `Broker`, and put the physical projection
on the concrete broker instance. See [Broker](#broker), the consumer-owned relationship rules in
[Eventing](modeling.md#eventing), and the shared-definition layout in
[Scaling](scaling.md#framework-once-use-everywhere).

Projection resolution is repeated for every concrete deployment selected by
the effective endpoint profiles. Nested deployment overrides are copy-on-write:
they clone the selected infrastructure for that logical owner without changing
the shared inventory or routing unrelated projected hops through the clone.

Inspect query JSON before rendering. Outer `source` and `target` are drawn;
nested `edge.source` and `edge.target` are the physical linked edge;
`edge.originSource` and `edge.originTarget` identify the selected logical
origin; and `edge.projectionOrigins` lists every logical consumer of a shared
physical segment.

Keep replication meshes and deeper provider topology in `description`,
`technology`, `via`, or notes unless an intermediate resource is a
first-order architectural component.

## Gateway

Expand an incoming relationship through a gateway and load balancer.

### definitions.ai

```insight
define type GatewayEnvironment of Environment
    Compute compute
    PublicGateway publicGateway

define type PublicGateway of NetworkConnection
    constructor publicGateway
    required InfrastructureComponent gateway
    required InfrastructureComponent loadBalancer
```

### infrastructure.ai

```insight
environment eu
    name = Europe

deployment production
    compute:
        compute kubernetes
            name = Kubernetes

    publicGateway:
        publicGateway public_edge
            name = Public edge
            gateway:
                infrastructureComponent edge_gateway
                    name = Edge gateway
            loadBalancer:
                infrastructureComponent load_balancer
                    name = Load balancer
            projection:
                source $from originalLink target gateway
                target gateway connectTo target loadBalancer
                    technology = HTTPS
                target loadBalancer connectTo target $to
                    technology = HTTP
```

### model.ai

```insight
context gateway_example

deploymentProfile service_profile
    appliesTo:
        production from eu
    runsOn compute

external actor customer
    name = Customer
    links:
        -> api
            technology = HTTPS
            description = Calls the public API
            deployment:
                uses publicGateway

system platform
    name = Platform

    service api
        name = API
        deployment:
            uses service_profile
```

Run:

```shell
archinsight link examples/deployment-projections/gateway --format text
archinsight query examples/deployment-projections/gateway -s model.ai -v deployment-container --environment eu --format json
```

Expected physical result:

- customer -> eu/edge_gateway keeps the authored logical operator and attributes.
- eu/edge_gateway -> eu/load_balancer and eu/load_balancer -> gateway_example/api are connectTo hops.

## Storage

Project a deployed element onto storage without using the unavailable `$to` term.

### definitions.ai

```insight
define type StorageEnvironment of Environment
    Compute compute
    Storage database
```

### infrastructure.ai

```insight
environment eu
    name = Europe

deployment production
    compute:
        compute kubernetes
            name = Kubernetes

    database:
        storage postgres
            name = PostgreSQL
            projection:
                source $from originalLink target $this
```

### model.ai

```insight
context storage_example

deploymentProfile stateful_profile
    appliesTo:
        production from eu
    runsOn compute
    uses database

system commerce
    name = Commerce

    service orders
        name = Orders
        deployment:
            uses stateful_profile
```

Run:

```shell
archinsight link examples/deployment-projections/storage --format text
archinsight query examples/deployment-projections/storage -s model.ai -v deployment-container --environment eu --format json
```

Expected physical result:

- storage_example/orders -> eu/postgres is one projected element relationship.
- Its originSource and originTarget both identify storage_example/orders.

## Broker

Route a consumer-owned async dependency through broker infrastructure in the physical event-flow direction.

### definitions.ai

```insight
define type BrokerEnvironment of Environment
    Compute compute
    Broker events

define type KafkaBroker of Broker
    constructor kafka
```

### infrastructure.ai

```insight
environment eu
    name = Europe

deployment production
    compute:
        compute kubernetes
            name = Kubernetes

    events:
        kafka kafka
            name = Kafka
            technology = Managed Kafka
            projection:
                target $to connectTo target $this
                    technology = Kafka
                target $this originalLink source $from
```

### model.ai

```insight
context broker_example

deploymentProfile service_profile
    appliesTo:
        production from eu
    runsOn compute

system commerce
    name = Commerce

    service publisher
        name = Order publisher
        deployment:
            uses service_profile

    service consumer
        name = Fulfillment consumer
        deployment:
            uses service_profile
        links:
            ~> publisher
                via = orders.created
                technology = Kafka
                description = Consumes order-created events
                deployment:
                    uses events
```

Run:

```shell
archinsight link examples/deployment-projections/broker --format text
archinsight query examples/deployment-projections/broker -s model.ai -v deployment-container --environment eu --format json
```

Expected physical result:

- broker_example/publisher -> eu/kafka is a new connectTo hop.
- eu/kafka -> broker_example/consumer is the original async link and retains model, via, technology, and description.

## Egress

Expand an outbound relationship through an egress gateway while retaining source-side ownership.

### definitions.ai

```insight
define type EgressEnvironment of Environment
    Compute compute
    Egress egress

define type Egress of NetworkConnection
    constructor egress
    required InfrastructureComponent gateway
```

### infrastructure.ai

```insight
environment eu
    name = Europe

deployment production
    compute:
        compute kubernetes
            name = Kubernetes

    egress:
        egress outbound
            name = Outbound path
            gateway:
                infrastructureComponent nat_gateway
                    name = NAT gateway
            projection:
                source $from originalLink source gateway
                source gateway connectTo target $to
                    technology = HTTPS
```

### external.ai

```insight
context providers

external system payment_api
    name = Payment API
```

### model.ai

```insight
context egress_example

import payment_api from context providers

deploymentProfile service_profile
    appliesTo:
        production from eu
    runsOn compute

system commerce
    name = Commerce

    service client
        name = Payment client
        deployment:
            uses service_profile
        links:
            -> payment_api
                technology = HTTPS
                description = Authorizes payments
                deployment:
                    uses egress
```

Run:

```shell
archinsight link examples/deployment-projections/egress --format text
archinsight query examples/deployment-projections/egress -s model.ai -v deployment-container --environment eu --format json
```

Expected physical result:

- egress_example/client -> eu/nat_gateway keeps the authored relationship through originalLink.
- eu/nat_gateway -> providers/payment_api is a connectTo hop in the same physical direction.
- Both hops use source-side placement and keep model.ai as edge.sourceIdentity for source-scoped discovery.

## Monitoring

Demonstrate a reverse-direction infrastructure edge and independent fan-out to two destinations.

### definitions.ai

```insight
define type MonitoringEnvironment of Environment
    Compute compute
    Monitoring observability

define type Monitoring of InfrastructureComponent
    constructor monitoring
    required InfrastructureComponent prometheus
    required InfrastructureComponent collector
```

### infrastructure.ai

```insight
environment eu
    name = Europe

deployment production
    compute:
        compute kubernetes
            name = Kubernetes

    observability:
        monitoring telemetry
            name = Telemetry agent
            prometheus:
                infrastructureComponent prometheus
                    name = Prometheus
            collector:
                infrastructureComponent otel_collector
                    name = OpenTelemetry Collector
            projection:
                target $this connectTo source $from
                target $this connectTo target prometheus
                target $this connectTo target collector
```

### model.ai

```insight
context monitoring_example

deploymentProfile observed_service
    appliesTo:
        production from eu
    runsOn compute
    uses observability

system platform
    name = Platform

    service api
        name = API
        deployment:
            uses observed_service
```

Run:

```shell
archinsight link examples/deployment-projections/monitoring --format text
archinsight query examples/deployment-projections/monitoring -s model.ai -v deployment-container --environment eu --format json
```

Expected physical result:

- eu/telemetry -> monitoring_example/api is the reverse-direction edge.
- eu/telemetry branches independently to eu/prometheus and eu/otel_collector, each exactly once.
