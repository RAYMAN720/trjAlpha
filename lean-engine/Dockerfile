# TradePilot adds one C# algorithm assembly to the full official QuantConnect LEAN engine.
# LEAN remains an upstream Apache-2.0 dependency and is not modified here.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS algorithm-build
WORKDIR /src
COPY TradePilot.Algorithm/TradePilot.Algorithm.csproj ./TradePilot.Algorithm/
RUN dotnet restore ./TradePilot.Algorithm/TradePilot.Algorithm.csproj
COPY TradePilot.Algorithm/ ./TradePilot.Algorithm/
RUN dotnet build ./TradePilot.Algorithm/TradePilot.Algorithm.csproj -c Release -o /out --no-restore

FROM quantconnect/lean:latest
# Copy only the custom assembly. Do not overwrite LEAN's own runtime assemblies.
COPY --from=algorithm-build /out/TradePilot.Algorithm.dll /Lean/Launcher/bin/Debug/TradePilot.Algorithm.dll
WORKDIR /Lean/Launcher/bin/Debug
ENTRYPOINT ["dotnet", "QuantConnect.Lean.Launcher.dll"]
