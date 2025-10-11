package com.gentorox.services.inference;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Configuration for AI model providers.
 */
@Component
@ConfigurationProperties(prefix = "providers")
public class ProviderConfig {
    
    private Map<String, ProviderSettings> providers;
    private String defaultProvider;
    
    public Map<String, ProviderSettings> getProviders() {
        return providers;
    }
    
    public void setProviders(Map<String, ProviderSettings> providers) {
        this.providers = providers;
    }
    
    public String getDefaultProvider() {
        return defaultProvider;
    }
    
    public void setDefaultProvider(String defaultProvider) {
        this.defaultProvider = defaultProvider;
    }
    
    /**
     * Settings for a specific provider.
     */
    public static class ProviderSettings {
        private String apiKey;
        private String baseUrl;
        private String endpoint;
        private String modelName;
        
        public String getApiKey() {
            return apiKey;
        }
        
        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }
        
        public String getBaseUrl() {
            return baseUrl;
        }
        
        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }
        
        public String getEndpoint() {
            return endpoint;
        }
        
        public void setEndpoint(String endpoint) {
            this.endpoint = endpoint;
        }
        
        public String getModelName() {
            return modelName;
        }
        
        public void setModelName(String modelName) {
            this.modelName = modelName;
        }
    }
}
