import React from 'react';
import { BNGDRASIL_PROJECTS } from '@/utils/constants';
import {
  CodeBracketIcon,
  LinkIcon,
  CalendarIcon,
  TagIcon,
  ServerIcon,
  CloudIcon,
  CpuChipIcon,
  ShieldCheckIcon,
  GlobeAltIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';

const PortfolioPage: React.FC = () => {
  // 개발자 정보
  const developerInfo = {
    name: 'bnbong',
    title: 'Full Stack Developer & Cloud Engineer',
    description: '개인 클라우드 인프라와 웹 개발에 관심이 많은 개발자입니다. BNGdrasil 프로젝트를 통해 완전한 클라우드 생태계 구축을 목표로 하고 있습니다.',
    location: 'South Korea',
    experience: '3+ years',
    interests: ['Cloud Infrastructure', 'DevOps', 'Web Development', 'Microservices'],
  };

  // 기술 스택
  const techStack = {
    backend: ['Python', 'FastAPI', 'Node.js', 'PostgreSQL', 'Redis'],
    frontend: ['React', 'TypeScript', 'TailwindCSS', 'Vite'],
    infrastructure: ['Docker', 'Terraform', 'OpenStack', 'Oracle Cloud'],
    tools: ['Git', 'GitHub Actions', 'Prometheus', 'Grafana', 'Nginx'],
  };

  // 프로젝트 카테고리별 아이콘
  const getCategoryIcon = (projectKey: string) => {
    const iconMap = {
      BIFROST: ServerIcon,
      BIDAR: ShieldCheckIcon,
      BANTHEON: GlobeAltIcon,
      BLYSIUM: CpuChipIcon,
      BAEDALUS: CloudIcon,
      BSGARD: WrenchScrewdriverIcon,
    };
    return iconMap[projectKey as keyof typeof iconMap] || CodeBracketIcon;
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <div className="mb-8">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-white bg-opacity-10 rounded-full mb-6">
                <span className="text-4xl font-bold">BNG</span>
              </div>
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              {developerInfo.name}
            </h1>
            
            <p className="text-xl md:text-2xl text-blue-200 mb-8">
              {developerInfo.title}
            </p>
            
            <p className="text-lg text-gray-300 max-w-3xl mx-auto mb-12">
              {developerInfo.description}
            </p>
            
            <div className="flex flex-wrap justify-center gap-6 text-sm">
              <div className="flex items-center space-x-2">
                <CalendarIcon className="h-5 w-5 text-blue-300" />
                <span>{developerInfo.experience} 경력</span>
              </div>
              <div className="flex items-center space-x-2">
                <GlobeAltIcon className="h-5 w-5 text-blue-300" />
                <span>{developerInfo.location}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 기술 스택 Section */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              기술 스택
            </h2>
            <p className="text-lg text-gray-600">
              다양한 기술을 활용하여 풀스택 개발과 인프라 구축을 진행합니다
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {Object.entries(techStack).map(([category, technologies]) => (
              <div key={category} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 capitalize">
                  {category === 'backend' && '백엔드'}
                  {category === 'frontend' && '프론트엔드'}
                  {category === 'infrastructure' && '인프라'}
                  {category === 'tools' && '도구'}
                </h3>
                <div className="space-y-2">
                  {technologies.map((tech) => (
                    <div
                      key={tech}
                      className="flex items-center space-x-2"
                    >
                      <div className="h-2 w-2 bg-blue-500 rounded-full" />
                      <span className="text-gray-700 text-sm">{tech}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BNGdrasil 프로젝트 Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              BNGdrasil 프로젝트
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              개인 클라우드 인프라를 구축하는 종합 프로젝트입니다. 
              각 서비스는 독립적으로 동작하면서도 유기적으로 연결되어 있습니다.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {Object.entries(BNGDRASIL_PROJECTS).map(([key, project]) => {
              const IconComponent = getCategoryIcon(key);
              return (
                <div
                  key={key}
                  className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden hover:shadow-xl transition-shadow duration-300"
                >
                  <div className="p-8">
                    <div className="flex items-center mb-6">
                      <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-lg mr-4">
                        <IconComponent className="h-6 w-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900 flex items-center">
                          <span className="mr-2">{project.emoji}</span>
                          {project.name}
                        </h3>
                        <p className="text-gray-600 text-sm">
                          {project.description}
                        </p>
                      </div>
                    </div>

                    <div className="mb-6">
                      <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                        <TagIcon className="h-4 w-4 mr-2" />
                        기술 스택
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {project.tech.map((tech) => (
                          <span
                            key={tech}
                            className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full"
                          >
                            {tech}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                      <a
                        href={project.github}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium"
                      >
                        <LinkIcon className="h-4 w-4 mr-2" />
                        GitHub에서 보기
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 아키텍처 Section */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              시스템 아키텍처
            </h2>
            <p className="text-lg text-gray-600">
              마이크로서비스 아키텍처를 기반으로 한 확장 가능한 클라우드 인프라
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Frontend */}
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-lg mb-4">
                  <GlobeAltIcon className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Frontend</h3>
                <p className="text-gray-600 text-sm mb-4">
                  React + TypeScript 기반 SPA
                </p>
                <div className="space-y-1 text-sm text-gray-500">
                  <div>• Bantheon (Portfolio)</div>
                  <div>• Blysium (Games)</div>
                  <div>• Admin Dashboard</div>
                </div>
              </div>

              {/* Backend */}
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-lg mb-4">
                  <ServerIcon className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Backend</h3>
                <p className="text-gray-600 text-sm mb-4">
                  FastAPI 기반 마이크로서비스
                </p>
                <div className="space-y-1 text-sm text-gray-500">
                  <div>• Bifrost (API Gateway)</div>
                  <div>• Bidar (Auth Server)</div>
                  <div>• Additional APIs</div>
                </div>
              </div>

              {/* Infrastructure */}
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 rounded-lg mb-4">
                  <CloudIcon className="h-8 w-8 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Infrastructure</h3>
                <p className="text-gray-600 text-sm mb-4">
                  IaC 기반 클라우드 인프라
                </p>
                <div className="space-y-1 text-sm text-gray-500">
                  <div>• Baedalus (Terraform)</div>
                  <div>• Bsgard (Network)</div>
                  <div>• Oracle Cloud / OpenStack</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 연락처 Section */}
      <section className="py-24 bg-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            함께 협업하고 싶으시다면
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            새로운 프로젝트나 협업 기회에 언제나 열려있습니다
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="mailto:bnbong@example.com"
              className="bg-white text-blue-600 hover:bg-gray-50 px-8 py-3 rounded-md font-medium transition-colors"
            >
              이메일 보내기
            </a>
            <a
              href="https://github.com/BNGdrasil"
              target="_blank"
              rel="noopener noreferrer"
              className="border border-white text-white hover:bg-white hover:text-blue-600 px-8 py-3 rounded-md font-medium transition-colors"
            >
              GitHub 보기
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PortfolioPage;
