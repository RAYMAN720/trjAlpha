# Third-Party Notices

## QuantConnect LEAN

TradePilot LEAN Edition uses the official QuantConnect LEAN engine as an external Docker image and NuGet dependency.

- Project: QuantConnect LEAN Algorithmic Trading Engine
- Source: https://github.com/QuantConnect/Lean
- License: Apache License 2.0
- Copyright: QuantConnect Corporation and LEAN contributors

TradePilot does not remove or replace LEAN's upstream license notices. The complete Apache License 2.0 text is included in `lean-engine/LICENSE-APACHE-2.0.txt`.

## QuantConnect Alpaca Brokerage Integration

The optional Alpaca paper-trading path uses QuantConnect's official Alpaca brokerage integration distributed with the LEAN ecosystem.

- Project: QuantConnect Alpaca brokerage integration
- Source: https://github.com/QuantConnect/Lean.Brokerages.Alpaca
- License: Apache License 2.0
- Copyright: QuantConnect Corporation and contributors

Local use can require QuantConnect credentials and an eligible organization/module entitlement. No broker or QuantConnect credentials are included in this artifact.

## TradePilot-specific code

The TradePilot gateway, dashboard adapter and `TradePilotLeanAlgorithm` are separate application code layered on top of LEAN. This artifact does not present upstream LEAN code as original TradePilot code and does not remove required attribution.
